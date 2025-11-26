"""
LibreChat Prompt Builder for Ragas Benchmarking

This module replicates LibreChat's prompt construction logic for use in 
external benchmarking frameworks like Ragas. It supports four scenarios:
1. Files - RAG context + file_search tool
2. MCP - MCP server instructions + MCP tools
3. Web Search - Web search context + tool
4. UI Agent - Full agent with all components

It also supports multi-turn conversations with tool calls and results:
- format_web_search_result() - Format web search results with citation anchors
- format_file_search_result() - Format file search results
- format_mcp_tool_result() - Format MCP tool results
- create_tool_result_message() - Create tool result messages for message chain
- create_assistant_tool_call_message() - Create assistant tool call messages
- build_multi_turn_request() - Build complete multi-turn conversations

Usage:
    from librechat_prompt_builder import LibreChatPromptBuilder
    
    builder = LibreChatPromptBuilder()
    
    # Single-turn request
    request = builder.build_request(
        scenario="mcp",
        user_message="What are the radiation protection requirements?",
        mcp_servers=[MCPServerConfig(
            server_name="ANVS-IAEA-Wetten",
            instructions="Use citation markers...",
            tools=[...]
        )]
    )
    
    # Multi-turn with tool results
    web_result = WebSearchResult(
        organic=[WebSearchSource(
            title="Example",
            link="https://example.com",
            snippet="Content here..."
        )]
    )
    formatted = builder.format_web_search_result(turn=0, result=web_result)
    
    multi_turn = builder.build_multi_turn_request(
        initial_request=request,
        turns=[
            {"tool_calls": [ToolCall(id="call_1", name="web_search", arguments={"query": "test"})]},
            {"tool_result": {"tool_call_id": "call_1", "content": formatted}},
            {"assistant": "Based on the search results..."}
        ]
    )
"""

from datetime import datetime
from typing import Literal, Optional, Any
from dataclasses import dataclass, field
import json
import re


@dataclass
class MCPServerConfig:
    """Configuration for an MCP server."""
    server_name: str
    instructions: str = ""
    tools: list[dict] = field(default_factory=list)


@dataclass
class FileConfig:
    """Configuration for attached files."""
    files: list[dict] = field(default_factory=list)
    rag_context: str = ""
    has_file_search: bool = True


@dataclass
class AgentConfig:
    """Configuration for a UI-defined agent."""
    name: str = "Assistant"
    instructions: str = ""
    additional_instructions: str = ""
    tools: list[str] = field(default_factory=list)
    artifacts_enabled: bool = False
    memory_enabled: bool = False
    memory_data: str = ""


@dataclass 
class WebSearchConfig:
    """Configuration for web search."""
    enabled: bool = True
    custom_rules: str = ""


@dataclass
class WebSearchHighlight:
    """A highlight/excerpt from a web search result."""
    text: str
    score: float = 0.85
    references: list[dict] = field(default_factory=list)


@dataclass
class WebSearchSource:
    """A single source from web search results."""
    title: str
    link: str
    snippet: str = ""
    date: str = ""
    attribution: str = ""
    highlights: list[WebSearchHighlight] = field(default_factory=list)


@dataclass
class WebSearchResult:
    """Complete web search result data."""
    organic: list[WebSearchSource] = field(default_factory=list)
    top_stories: list[WebSearchSource] = field(default_factory=list)
    knowledge_graph: dict = field(default_factory=dict)
    answer_box: dict = field(default_factory=dict)
    people_also_ask: list[dict] = field(default_factory=list)


@dataclass
class FileSearchMatch:
    """A single match from file search."""
    filename: str
    content: str
    page: str = ""
    relevance: float = 0.85


@dataclass
class FileSearchResult:
    """File search result data."""
    matches: list[FileSearchMatch] = field(default_factory=list)


@dataclass
class ToolCall:
    """Represents an LLM tool call."""
    id: str
    name: str
    arguments: dict


@dataclass
class PromptRequest:
    """Complete prompt request ready for LLM API."""
    system_prompt: str
    messages: list[dict]
    tools: list[dict]
    model: str = "gpt-4"
    temperature: float = 0.7
    
    def to_openai_format(self) -> dict:
        """Convert to OpenAI API request format."""
        request = {
            "model": self.model,
            "messages": self.messages,
            "temperature": self.temperature,
        }
        if self.tools:
            request["tools"] = self.tools
            request["tool_choice"] = "auto"
        return request
    
    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "system_prompt": self.system_prompt,
            "messages": self.messages,
            "tools": self.tools,
            "model": self.model,
            "temperature": self.temperature,
        }


class LibreChatPromptBuilder:
    """
    Mock LibreChat prompt construction for Ragas benchmarking.
    
    Replicates the prompt assembly logic from:
    - api/server/controllers/agents/client.js (buildMessages)
    - packages/api/src/agents/run.ts (createRun)
    - packages/api/src/mcp/MCPManager.ts (formatInstructionsForContext)
    """
    
    # Memory instructions (from packages/api/src/agents/memory.ts)
    MEMORY_INSTRUCTIONS = (
        "The system automatically stores important user information and can "
        "update or delete memories based on user requests, enabling dynamic "
        "memory management."
    )
    
    # File search bias instruction
    FILE_SEARCH_BIAS = (
        "When files are attached, ALWAYS call the file_search tool first to "
        "retrieve the most relevant passages. Call file_search MULTIPLE times "
        "with different queries to gather comprehensive information from various "
        "sections. Use the retrieved quotes to draft your answer and include "
        "citation anchors as instructed. Provide rich citations: use multiple "
        "references per paragraph when information comes from different sources."
    )
    
    # Web search tool context template
    WEB_SEARCH_CONTEXT = '''# `web_search` (WEB SEARCH) – RULES

YOU HAVE ACCESS TO A WEB SEARCH TOOL. FOLLOW THESE RULES STRICTLY:

1. CALL THE TOOL INSTEAD OF DESCRIBING A SEARCH.
   - Never write things like "let's search", "we should use web_search" or raw JSON such as {{"query": "..."}}.
   - When you decide that web search is needed, IMMEDIATELY call the `web_search` tool.

2. HOW OFTEN TO USE IT
   - At most **one tool call per user question** (unless the user explicitly asks for more searches).
   - Do not call the tool again for the same question after you have results.

3. HOW TO WRITE THE QUERY
   - Use a short keyword query (3–6 words), not a full sentence.
   - Example good queries:
     - "Rotterdam weather now"
     - "Rotterdam hourly weather"
   - Avoid long natural language queries.

4. AFTER THE TOOL RETURNS
   - Read the provided "output" text and answer the user directly.
   - Start with a clear answer, then explain details.
   - Use citations that are already provided; do not invent new URLs.

ANSWER IN THE USER'S LANGUAGE.'''

    def __init__(self, user_name: str = "User"):
        """
        Initialize the prompt builder.
        
        Args:
            user_name: The user's display name for placeholder replacement.
        """
        self.user_name = user_name
    
    def replace_special_vars(self, text: str) -> str:
        """
        Replace LibreChat placeholder variables.
        
        Placeholders:
        - {{current_date}} -> YYYY-MM-DD (weekday)
        - {{current_datetime}} -> YYYY-MM-DD HH:mm:ss (weekday)
        - {{iso_datetime}} -> ISO 8601 timestamp
        - {{current_user}} -> User's display name
        """
        if not text:
            return text
        
        now = datetime.now()
        weekday = now.weekday()  # 0=Monday in Python, but JS uses 0=Sunday
        # Convert to JS weekday (0=Sunday)
        js_weekday = (weekday + 1) % 7
        
        current_date = f"{now.strftime('%Y-%m-%d')} ({js_weekday})"
        current_datetime = f"{now.strftime('%Y-%m-%d %H:%M:%S')} ({js_weekday})"
        iso_datetime = now.isoformat()
        
        result = text
        result = re.sub(r'\{\{current_date\}\}', current_date, result, flags=re.IGNORECASE)
        result = re.sub(r'\{\{current_datetime\}\}', current_datetime, result, flags=re.IGNORECASE)
        result = re.sub(r'\{\{iso_datetime\}\}', iso_datetime, result, flags=re.IGNORECASE)
        result = re.sub(r'\{\{current_user\}\}', self.user_name, result, flags=re.IGNORECASE)
        
        return result
    
    def format_mcp_instructions(self, servers: list[MCPServerConfig]) -> str:
        """
        Format MCP server instructions for context injection.
        
        Replicates: packages/api/src/mcp/MCPManager.ts:formatInstructionsForContext
        """
        servers_with_instructions = [s for s in servers if s.instructions]
        
        if not servers_with_instructions:
            return ""
        
        formatted = []
        for server in servers_with_instructions:
            formatted.append(f"## {server.server_name} MCP Server Instructions\n\n{server.instructions}")
        
        return f"""# MCP Server Instructions

The following MCP servers are available with their specific instructions:

{chr(10).join(formatted)}

Please follow these instructions when using tools from the respective MCP servers."""
    
    def format_rag_context(self, files: list[dict], context_items: list[dict]) -> str:
        """
        Format RAG context for embedded files.
        
        Replicates: api/app/clients/prompts/createContextHandlers.js:createContext
        """
        if not files:
            return ""
        
        one_file = len(files) == 1
        header = f"The user has attached {'a' if one_file else len(files)} file{'s' if not one_file else ''} to the conversation:"
        
        files_xml = ""
        if not one_file:
            files_xml = "\n<files>"
        for f in files:
            files_xml += f"""
  <file>
    <filename>{f.get('filename', 'unknown')}</filename>
    <type>{f.get('type', 'unknown')}</type>
  </file>"""
        if not one_file:
            files_xml += "\n</files>"
        
        context_xml = ""
        for item in context_items:
            context_xml += f"""
  <file>
    <filename>{item.get('filename', 'unknown')}</filename>
    <context>
      <contextItem>
        <![CDATA[{item.get('content', '')}]]>
      </contextItem>
    </context>
  </file>"""
        
        footer = """Use the context as your learned knowledge to better answer the user.

In your response, remember to follow these guidelines:
- If you don't know the answer, simply say that you don't know.
- If you are unsure how to answer, ask for clarification.
- Avoid mentioning that you obtained the information from the context."""
        
        return f"""{header}
{files_xml}

A semantic search was executed with the user's message as the query, retrieving the following context inside <context></context> XML tags.

<context>{context_xml}
</context>

{footer}"""
    
    def format_file_search_context(self, files: list[dict]) -> str:
        """
        Format file search tool context.
        
        Replicates: api/app/clients/tools/util/fileSearch.js:primeFiles
        """
        if not files:
            return "- Note: Semantic search is available through the file_search tool but no files are currently loaded."
        
        context = "- Note: Use the file_search tool to find relevant information within:"
        for f in files:
            just_attached = f.get('just_attached', False)
            suffix = " (just attached by user)" if just_attached else ""
            context += f"\n\t- {f.get('filename', 'unknown')}{suffix}"
        
        return context
    
    def create_mcp_tool(self, tool_name: str, server_name: str, description: str, 
                        parameters: dict) -> dict:
        """Create an MCP tool in OpenAI function format."""
        full_name = f"{tool_name}__mcp__{server_name}"
        return {
            "type": "function",
            "function": {
                "name": full_name,
                "description": description,
                "parameters": parameters
            }
        }
    
    def create_file_search_tool(self) -> dict:
        """Create the file_search tool."""
        return {
            "type": "function",
            "function": {
                "name": "file_search",
                "description": "Search through attached files to find relevant information.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query to find relevant content in files"
                        }
                    },
                    "required": ["query"]
                }
            }
        }
    
    def create_web_search_tool(self) -> dict:
        """Create the web_search tool."""
        return {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Search the web for current information. Returns relevant web pages with snippets.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query (3-6 keywords recommended)"
                        }
                    },
                    "required": ["query"]
                }
            }
        }
    
    def format_web_search_result(
        self,
        turn: int,
        result: WebSearchResult,
    ) -> str:
        """
        Format web search results for LLM consumption.
        
        Replicates: packages/agents/src/tools/search/format.ts:formatResultsForLLM
        
        Args:
            turn: The turn number (0-indexed) for citation anchors
            result: WebSearchResult with organic results, news, etc.
        
        Returns:
            Formatted string with citation anchors like \\ue202turn0search0
        """
        output_lines = []
        
        def add_section(title: str):
            output_lines.append("")
            output_lines.append(f"=== {title} ===")
            output_lines.append("")
        
        if result.organic:
            add_section(f"Web Results, Turn {turn}")
            for i, source in enumerate(result.organic):
                output_lines.append(f'# Search {i}: "{source.title or "(no title)"}"')
                output_lines.append(f"\nAnchor: \\ue202turn{turn}search{i}")
                output_lines.append(f"URL: {source.link}")
                
                if source.snippet:
                    output_lines.append(f"Summary: {source.snippet}")
                if source.date:
                    output_lines.append(f"Date: {source.date}")
                if source.attribution:
                    output_lines.append(f"Source: {source.attribution}")
                
                if source.highlights:
                    output_lines.append("\n## Highlights")
                    output_lines.append("")
                    
                    for h_idx, highlight in enumerate(source.highlights):
                        output_lines.append(f"### Highlight {h_idx + 1} [Relevance: {highlight.score:.2f}]")
                        output_lines.append("")
                        output_lines.append("```text")
                        output_lines.append(highlight.text.strip())
                        output_lines.append("```")
                        output_lines.append("")
                        
                        if highlight.references:
                            output_lines.append("Core References:")
                            for ref_idx, ref in enumerate(highlight.references):
                                output_lines.append(f"- link#{ref_idx + 1}: {ref.get('url', '')}")
                                output_lines.append(f"\t- Anchor: \\ue202turn{turn}ref{ref_idx}")
                            output_lines.append("")
                        
                        if h_idx < len(source.highlights) - 1:
                            output_lines.append("---")
                            output_lines.append("")
                
                output_lines.append("")
        
        if result.top_stories:
            add_section("News Results")
            for i, source in enumerate(result.top_stories):
                output_lines.append(f'# News {i}: "{source.title or "(no title)"}"')
                output_lines.append(f"\nAnchor: \\ue202turn{turn}news{i}")
                output_lines.append(f"URL: {source.link}")
                
                if source.snippet:
                    output_lines.append(f"Summary: {source.snippet}")
                if source.date:
                    output_lines.append(f"Date: {source.date}")
                if source.attribution:
                    output_lines.append(f"Source: {source.attribution}")
                output_lines.append("")
        
        if result.knowledge_graph:
            add_section("Knowledge Graph")
            kg = result.knowledge_graph
            if kg.get("title"):
                output_lines.append(f"**Title:** {kg['title']}")
            if kg.get("type"):
                output_lines.append(f"**Type:** {kg['type']}")
            if kg.get("description"):
                output_lines.append(f"**Description:** {kg['description']}")
            if kg.get("website"):
                output_lines.append(f"**Website:** {kg['website']}")
            output_lines.append("")
        
        if result.answer_box:
            add_section("Answer Box")
            ab = result.answer_box
            if ab.get("title"):
                output_lines.append(f"**Title:** {ab['title']}")
            if ab.get("snippet"):
                output_lines.append(f"**Snippet:** {ab['snippet']}")
            if ab.get("link"):
                output_lines.append(f"**Link:** {ab['link']}")
            output_lines.append("")
        
        if result.people_also_ask:
            add_section("People Also Ask")
            for i, paa in enumerate(result.people_also_ask):
                output_lines.append(f"### Question {i + 1}:")
                output_lines.append(f'"{paa.get("question", "")}"')
                if paa.get("snippet"):
                    output_lines.append(f"Snippet: {paa['snippet']}")
                if paa.get("title"):
                    output_lines.append(f"Title: {paa['title']}")
                if paa.get("link"):
                    output_lines.append(f"Link: {paa['link']}")
                output_lines.append("")
        
        return "\n".join(output_lines).strip()
    
    def format_file_search_result(
        self,
        result: FileSearchResult,
    ) -> str:
        """
        Format file search results for LLM consumption.
        
        Args:
            result: FileSearchResult with matches from files
        
        Returns:
            Formatted string with file search results
        """
        if not result.matches:
            return "No relevant passages found in the attached files."
        
        output_lines = [f"Found {len(result.matches)} relevant passages:"]
        output_lines.append("")
        
        for i, match in enumerate(result.matches, 1):
            location = f" (page {match.page})" if match.page else ""
            output_lines.append(f"[{i}] From: {match.filename}{location}")
            output_lines.append(f"Relevance: {match.relevance:.2f}")
            output_lines.append(f'"{match.content}"')
            output_lines.append("")
        
        return "\n".join(output_lines).strip()
    
    def format_mcp_tool_result(
        self,
        content: str,
        tool_name: str = "",
    ) -> str:
        """
        Format MCP tool result for LLM consumption.
        
        MCP tools can return various content types. This method handles
        text content (most common case).
        
        Args:
            content: The text content from the MCP tool
            tool_name: Optional tool name for context
        
        Returns:
            Formatted string for the tool result
        """
        return content
    
    def create_tool_result_message(
        self,
        tool_call_id: str,
        content: str,
    ) -> dict:
        """
        Create a tool result message for the message chain.
        
        Args:
            tool_call_id: The ID from the assistant's tool call
            content: The formatted tool result content
        
        Returns:
            Message dict with role="tool"
        """
        return {
            "role": "tool",
            "content": content,
            "tool_call_id": tool_call_id,
        }
    
    def create_assistant_tool_call_message(
        self,
        tool_calls: list[ToolCall],
        content: str = "",
    ) -> dict:
        """
        Create an assistant message with tool calls.
        
        Args:
            tool_calls: List of ToolCall objects
            content: Optional text content (usually empty for tool calls)
        
        Returns:
            Message dict with role="assistant" and tool_calls
        """
        return {
            "role": "assistant",
            "content": content,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.name,
                        "arguments": json.dumps(tc.arguments),
                    }
                }
                for tc in tool_calls
            ]
        }
    
    def build_multi_turn_request(
        self,
        initial_request: "PromptRequest",
        turns: list[dict],
    ) -> "PromptRequest":
        """
        Build a multi-turn conversation with tool calls and results.
        
        Args:
            initial_request: The initial PromptRequest (system + user message)
            turns: List of turn dicts, each containing either:
                - {"tool_calls": [ToolCall, ...]} for assistant tool calls
                - {"tool_result": {"tool_call_id": str, "content": str}} for tool results
                - {"assistant": str} for assistant text response
        
        Returns:
            PromptRequest with complete multi-turn conversation
        
        Example:
            builder = LibreChatPromptBuilder()
            initial = builder.build_web_search_prompt(
                user_message="What's the weather?",
                agent_instructions="You are helpful."
            )
            
            multi_turn = builder.build_multi_turn_request(
                initial_request=initial,
                turns=[
                    {"tool_calls": [ToolCall(
                        id="call_001",
                        name="web_search",
                        arguments={"query": "weather Rotterdam"}
                    )]},
                    {"tool_result": {
                        "tool_call_id": "call_001",
                        "content": "=== Web Results, Turn 0 ===..."
                    }},
                    {"assistant": "The weather in Rotterdam is..."}
                ]
            )
        """
        messages = initial_request.messages.copy()
        
        for turn in turns:
            if "tool_calls" in turn:
                messages.append(self.create_assistant_tool_call_message(
                    tool_calls=turn["tool_calls"],
                    content=turn.get("content", ""),
                ))
            elif "tool_result" in turn:
                tr = turn["tool_result"]
                messages.append(self.create_tool_result_message(
                    tool_call_id=tr["tool_call_id"],
                    content=tr["content"],
                ))
            elif "assistant" in turn:
                messages.append({
                    "role": "assistant",
                    "content": turn["assistant"],
                })
        
        return PromptRequest(
            system_prompt=initial_request.system_prompt,
            messages=messages,
            tools=initial_request.tools,
            model=initial_request.model,
            temperature=initial_request.temperature,
        )
    
    def build_files_prompt(
        self,
        user_message: str,
        files: list[dict],
        rag_context_items: list[dict] = None,
        agent_instructions: str = "",
        model: str = "gpt-4",
        temperature: float = 0.7,
    ) -> PromptRequest:
        """
        Build prompt for Scenario 1: Attaching Files.
        
        Components:
        1. File search bias instruction (if files + file_search)
        2. RAG context (if embedded files)
        3. Agent instructions
        4. File search tool context
        """
        components = []
        
        # 1. File search bias instruction
        components.append(self.FILE_SEARCH_BIAS)
        
        # 2. RAG context
        if rag_context_items:
            rag_context = self.format_rag_context(files, rag_context_items)
            components.append(rag_context)
        
        # 3. Agent instructions
        if agent_instructions:
            processed_instructions = self.replace_special_vars(agent_instructions)
            components.append(processed_instructions)
        
        # 4. File search tool context
        file_context = self.format_file_search_context(files)
        components.append(file_context)
        
        system_prompt = "\n\n".join(filter(None, components))
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
        
        tools = [self.create_file_search_tool()]
        
        return PromptRequest(
            system_prompt=system_prompt,
            messages=messages,
            tools=tools,
            model=model,
            temperature=temperature
        )
    
    def build_mcp_prompt(
        self,
        user_message: str,
        mcp_servers: list[MCPServerConfig],
        agent_instructions: str = "",
        model: str = "gpt-4",
        temperature: float = 0.7,
    ) -> PromptRequest:
        """
        Build prompt for Scenario 2: MCP Tools.
        
        Components:
        1. Agent instructions
        2. MCP server instructions
        """
        components = []
        
        # 1. Agent instructions
        if agent_instructions:
            processed_instructions = self.replace_special_vars(agent_instructions)
            components.append(processed_instructions)
        
        # 2. MCP server instructions
        mcp_instructions = self.format_mcp_instructions(mcp_servers)
        if mcp_instructions:
            components.append(mcp_instructions)
        
        system_prompt = "\n\n".join(filter(None, components))
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
        
        # Collect all tools from MCP servers
        tools = []
        for server in mcp_servers:
            tools.extend(server.tools)
        
        return PromptRequest(
            system_prompt=system_prompt,
            messages=messages,
            tools=tools,
            model=model,
            temperature=temperature
        )
    
    def build_web_search_prompt(
        self,
        user_message: str,
        agent_instructions: str = "",
        custom_web_search_context: str = None,
        model: str = "gpt-4",
        temperature: float = 0.7,
    ) -> PromptRequest:
        """
        Build prompt for Scenario 3: Web Search.
        
        Components:
        1. Agent instructions
        2. Web search tool context (rules)
        """
        components = []
        
        # 1. Agent instructions
        if agent_instructions:
            processed_instructions = self.replace_special_vars(agent_instructions)
            components.append(processed_instructions)
        
        # 2. Web search tool context
        web_context = custom_web_search_context or self.WEB_SEARCH_CONTEXT
        components.append(web_context)
        
        system_prompt = "\n\n".join(filter(None, components))
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
        
        tools = [self.create_web_search_tool()]
        
        return PromptRequest(
            system_prompt=system_prompt,
            messages=messages,
            tools=tools,
            model=model,
            temperature=temperature
        )
    
    def build_ui_agent_prompt(
        self,
        user_message: str,
        agent: AgentConfig,
        files: list[dict] = None,
        rag_context_items: list[dict] = None,
        mcp_servers: list[MCPServerConfig] = None,
        web_search_enabled: bool = False,
        model: str = "gpt-4",
        temperature: float = 0.7,
    ) -> PromptRequest:
        """
        Build prompt for Scenario 4: UI-Defined Agents.
        
        Components (in order):
        1. Tool contexts (file_search, web_search, etc.)
        2. File search bias (if files + file_search)
        3. RAG context (if embedded files)
        4. Agent instructions
        5. Additional instructions (artifacts)
        6. MCP server instructions
        7. Memory instructions + data
        """
        components = []
        tools = []
        
        has_file_search = "file_search" in (agent.tools or [])
        has_files = bool(files)
        
        # 1. Tool contexts
        tool_contexts = []
        
        if has_file_search and files:
            file_context = self.format_file_search_context(files)
            tool_contexts.append(file_context)
            tools.append(self.create_file_search_tool())
        
        if web_search_enabled or "web_search" in (agent.tools or []):
            tool_contexts.append(self.WEB_SEARCH_CONTEXT)
            tools.append(self.create_web_search_tool())
        
        if tool_contexts:
            components.append("\n\n".join(tool_contexts))
        
        # 2. File search bias (if files + file_search)
        if has_files and has_file_search:
            components.append(self.FILE_SEARCH_BIAS)
        
        # 3. RAG context
        if rag_context_items and files:
            rag_context = self.format_rag_context(files, rag_context_items)
            components.append(rag_context)
        
        # 4. Agent instructions
        if agent.instructions:
            processed_instructions = self.replace_special_vars(agent.instructions)
            components.append(processed_instructions)
        
        # 5. Additional instructions (artifacts)
        if agent.additional_instructions:
            components.append(agent.additional_instructions)
        
        # 6. MCP server instructions
        if mcp_servers:
            mcp_instructions = self.format_mcp_instructions(mcp_servers)
            if mcp_instructions:
                components.append(mcp_instructions)
            # Add MCP tools
            for server in mcp_servers:
                tools.extend(server.tools)
        
        # 7. Memory instructions + data
        if agent.memory_enabled and agent.memory_data:
            memory_section = f"{self.MEMORY_INSTRUCTIONS}\n\n# Existing memory about the user:\n{agent.memory_data}"
            components.append(memory_section)
        
        system_prompt = "\n\n".join(filter(None, components))
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
        
        return PromptRequest(
            system_prompt=system_prompt,
            messages=messages,
            tools=tools,
            model=model,
            temperature=temperature
        )
    
    def build_request(
        self,
        scenario: Literal["files", "mcp", "web_search", "ui_agent"],
        user_message: str,
        model: str = "gpt-4",
        temperature: float = 0.7,
        **config
    ) -> PromptRequest:
        """
        Build a complete prompt request for the specified scenario.
        
        Args:
            scenario: One of "files", "mcp", "web_search", "ui_agent"
            user_message: The user's question/message
            model: LLM model to use
            temperature: Sampling temperature
            **config: Scenario-specific configuration
        
        Returns:
            PromptRequest with system_prompt, messages, tools
        
        Example:
            builder = LibreChatPromptBuilder()
            
            # MCP scenario
            request = builder.build_request(
                scenario="mcp",
                user_message="What are radiation protection requirements?",
                mcp_servers=[MCPServerConfig(
                    server_name="ANVS-IAEA-Wetten",
                    instructions="Use citation markers...",
                    tools=[{...}]
                )]
            )
        """
        if scenario == "files":
            return self.build_files_prompt(
                user_message=user_message,
                files=config.get("files", []),
                rag_context_items=config.get("rag_context_items"),
                agent_instructions=config.get("agent_instructions", ""),
                model=model,
                temperature=temperature
            )
        
        elif scenario == "mcp":
            return self.build_mcp_prompt(
                user_message=user_message,
                mcp_servers=config.get("mcp_servers", []),
                agent_instructions=config.get("agent_instructions", ""),
                model=model,
                temperature=temperature
            )
        
        elif scenario == "web_search":
            return self.build_web_search_prompt(
                user_message=user_message,
                agent_instructions=config.get("agent_instructions", ""),
                custom_web_search_context=config.get("custom_web_search_context"),
                model=model,
                temperature=temperature
            )
        
        elif scenario == "ui_agent":
            return self.build_ui_agent_prompt(
                user_message=user_message,
                agent=config.get("agent", AgentConfig()),
                files=config.get("files"),
                rag_context_items=config.get("rag_context_items"),
                mcp_servers=config.get("mcp_servers"),
                web_search_enabled=config.get("web_search_enabled", False),
                model=model,
                temperature=temperature
            )
        
        else:
            raise ValueError(f"Unknown scenario: {scenario}")


# Convenience function to create NEO MCP server tools
def create_neo_search_tools(server_name: str = "neo-search-server") -> list[dict]:
    """
    Create the 6 NEO MCP server tools following the 2-step search pattern.
    
    Tool Pattern (for each collection):
    - STEP 1: zoek_documenten_* - Discover relevant documents, get Document IDs
    - STEP 2: zoek_in_specifieke_* - Search within specific documents by ID
    
    Collections:
    - Nederlandse wetgeving (wetten_overheid)
    - IAEA nuclear safety (iaea)
    - ANVS nuclear safety (anvs)
    """
    builder = LibreChatPromptBuilder()
    
    return [
        # Dutch Legislation - STEP 1
        builder.create_mcp_tool(
            tool_name="zoek_documenten_nederlandse_wetgeving",
            server_name=server_name,
            description=(
                "STEP 1: Search Dutch legislation database to discover which documents are relevant to your query. "
                "Use this tool FIRST to identify relevant documents. Each result displays '📄 Document ID: [number]' - "
                "these are the IDs you need for step 2. After reviewing results, use 'zoek_in_specifieke_wetgeving' "
                "with the document IDs from the summary for focused search."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "The search query or question"},
                    "num_results": {"type": "integer", "description": "Number of results to return (1-10, default: 5)"}
                },
                "required": ["question"]
            }
        ),
        # Dutch Legislation - STEP 2
        builder.create_mcp_tool(
            tool_name="zoek_in_specifieke_wetgeving",
            server_name=server_name,
            description=(
                "STEP 2: Search within specific Dutch legislation documents that you've already identified. "
                "Use this tool AFTER 'zoek_documenten_nederlandse_wetgeving'. IMPORTANT: doc_ids requires actual "
                "Document ID numbers from step 1 (e.g., [39248184, 12345], NOT [0, 1, 2])."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "The search query or question"},
                    "doc_ids": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "List of document IDs to search within (from step 1 SUMMARY)"
                    },
                    "num_results": {"type": "integer", "description": "Number of chunks to return (1-20, default: 10)"}
                },
                "required": ["question", "doc_ids"]
            }
        ),
        # IAEA - STEP 1
        builder.create_mcp_tool(
            tool_name="zoek_documenten_iaea_kennis",
            server_name=server_name,
            description=(
                "STEP 1: Search IAEA nuclear safety database to discover which documents are relevant to your query. "
                "Use this tool FIRST to identify relevant IAEA documents. After reviewing results, use "
                "'zoek_in_specifieke_iaea_documenten' with the document IDs for focused search."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "The search query or question"},
                    "num_results": {"type": "integer", "description": "Number of results to return (1-10, default: 5)"}
                },
                "required": ["question"]
            }
        ),
        # IAEA - STEP 2
        builder.create_mcp_tool(
            tool_name="zoek_in_specifieke_iaea_documenten",
            server_name=server_name,
            description=(
                "STEP 2: Search within specific IAEA nuclear safety documents that you've already identified. "
                "Use this tool AFTER 'zoek_documenten_iaea_kennis'. IMPORTANT: doc_ids requires actual "
                "Document ID numbers from step 1."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "The search query or question"},
                    "doc_ids": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "List of document IDs to search within (from step 1 SUMMARY)"
                    },
                    "num_results": {"type": "integer", "description": "Number of chunks to return (1-20, default: 10)"}
                },
                "required": ["question", "doc_ids"]
            }
        ),
        # ANVS - STEP 1
        builder.create_mcp_tool(
            tool_name="zoek_documenten_anvs_kennis",
            server_name=server_name,
            description=(
                "STEP 1: Search ANVS nuclear safety database to discover which documents are relevant to your query. "
                "Use this tool FIRST to identify relevant ANVS documents. After reviewing results, use "
                "'zoek_in_specifieke_anvs_documenten' with the document IDs for focused search."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "The search query or question"},
                    "num_results": {"type": "integer", "description": "Number of results to return (1-10, default: 5)"}
                },
                "required": ["question"]
            }
        ),
        # ANVS - STEP 2
        builder.create_mcp_tool(
            tool_name="zoek_in_specifieke_anvs_documenten",
            server_name=server_name,
            description=(
                "STEP 2: Search within specific ANVS nuclear safety documents that you've already identified. "
                "Use this tool AFTER 'zoek_documenten_anvs_kennis'. IMPORTANT: doc_ids requires actual "
                "Document ID numbers from step 1."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "The search query or question"},
                    "doc_ids": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "List of document IDs to search within (from step 1 SUMMARY)"
                    },
                    "num_results": {"type": "integer", "description": "Number of chunks to return (1-20, default: 10)"}
                },
                "required": ["question", "doc_ids"]
            }
        ),
    ]


# Keep backward compatibility alias
def create_anvs_iaea_wetten_tools(server_name: str = "neo-search-server") -> list[dict]:
    """Alias for create_neo_search_tools for backward compatibility."""
    return create_neo_search_tools(server_name)


# Default NEO server instructions
NEO_SERVER_INSTRUCTIONS = """You have access to search tools for nuclear regulation documents using a 2-STEP process.

**STEP 1 - DOCUMENT DISCOVERY:**
Use 'zoek_documenten_*' tools FIRST to identify relevant documents.
Results show "📄 Document ID: [number]" for each document.
Check the SUMMARY at the end for all unique Document IDs.

**STEP 2 - FOCUSED SEARCH:**
Use 'zoek_in_specifieke_*' tools with the Document IDs from Step 1.
Pass doc_ids as a list of integers: [39248184, 12345]
NOT [0, 1, 2] - use the actual Document ID numbers!

**AVAILABLE COLLECTIONS:**
- Nederlandse wetgeving: zoek_documenten_nederlandse_wetgeving → zoek_in_specifieke_wetgeving
- IAEA documenten: zoek_documenten_iaea_kennis → zoek_in_specifieke_iaea_documenten
- ANVS documenten: zoek_documenten_anvs_kennis → zoek_in_specifieke_anvs_documenten

**CITATION FORMAT:**
Use citation markers exactly as provided in search results: \\ue202turn0file{n}
Place markers immediately after sentences derived from that source.

Always answer in the user's language (Dutch)."""


# Example usage
if __name__ == "__main__":
    builder = LibreChatPromptBuilder(user_name="Test User")
    
    # Example 1: MCP scenario with 6 NEO tools (2-step pattern)
    print("=" * 60)
    print("EXAMPLE 1: MCP Scenario with NEO Search Server (6 tools)")
    print("=" * 60)
    
    mcp_server = MCPServerConfig(
        server_name="neo-search-server",
        instructions=NEO_SERVER_INSTRUCTIONS,
        tools=create_neo_search_tools()
    )
    
    request = builder.build_request(
        scenario="mcp",
        user_message="Wat zijn de eisen voor stralingsbescherming bij nucleaire installaties in Nederland?",
        agent_instructions="You are a nuclear regulations expert assistant. Current date: {{current_date}}.\n\nHelp users understand nuclear safety regulations, radiation protection requirements, and compliance obligations.",
        mcp_servers=[mcp_server],
        model="gpt-4",
        temperature=0.7
    )
    
    print("\n--- System Prompt ---")
    print(request.system_prompt)
    print("\n--- Tools (6 tools in 2-step pattern) ---")
    for tool in request.tools:
        name = tool["function"]["name"]
        # Extract step info from name
        if "zoek_documenten" in name:
            step = "STEP 1 (Discovery)"
        else:
            step = "STEP 2 (Focused)"
        print(f"  - {name}")
        print(f"    [{step}]")
    print("\n--- OpenAI Request Format ---")
    openai_request = request.to_openai_format()
    print(f"Model: {openai_request['model']}")
    print(f"Temperature: {openai_request['temperature']}")
    print(f"Tools count: {len(openai_request.get('tools', []))}")
    
    # Example 2: Files scenario
    print("\n" + "=" * 60)
    print("EXAMPLE 2: Files Scenario")
    print("=" * 60)
    
    files_request = builder.build_request(
        scenario="files",
        user_message="What does the report say about renewable energy?",
        files=[
            {"filename": "report.pdf", "type": "application/pdf"},
            {"filename": "data.xlsx", "type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "just_attached": True}
        ],
        rag_context_items=[
            {"filename": "report.pdf", "content": "Renewable energy adoption increased by 15% in 2024..."}
        ],
        agent_instructions="You are a helpful research assistant."
    )
    
    print("\n--- System Prompt (truncated) ---")
    print(files_request.system_prompt[:500] + "...")
    
    # Example 3: Web Search scenario
    print("\n" + "=" * 60)
    print("EXAMPLE 3: Web Search Scenario")
    print("=" * 60)
    
    web_request = builder.build_request(
        scenario="web_search",
        user_message="What's the weather in Rotterdam?",
        agent_instructions="You are a helpful assistant. Current date: {{current_date}}."
    )
    
    print("\n--- System Prompt ---")
    print(web_request.system_prompt)
    
    # Example 4: Multi-turn Web Search with Tool Results
    print("\n" + "=" * 60)
    print("EXAMPLE 4: Multi-turn Web Search Conversation")
    print("=" * 60)
    
    web_search_result = WebSearchResult(
        organic=[
            WebSearchSource(
                title="Rotterdam Weather - Current Conditions",
                link="https://weather.com/rotterdam",
                snippet="Current temperature 12°C, partly cloudy. Wind 15 km/h from the west.",
                highlights=[
                    WebSearchHighlight(
                        text="Rotterdam, Netherlands\nCurrent: 12°C (54°F)\nConditions: Partly Cloudy\nWind: W 15 km/h\nHumidity: 72%\nForecast: Temperatures will drop to 8°C tonight.",
                        score=0.95,
                    )
                ]
            ),
            WebSearchSource(
                title="Rotterdam Hourly Forecast",
                link="https://weather.com/rotterdam/hourly",
                snippet="Hour by hour forecast showing temperatures ranging from 8-14°C today.",
            )
        ]
    )
    
    formatted_result = builder.format_web_search_result(turn=0, result=web_search_result)
    
    multi_turn = builder.build_multi_turn_request(
        initial_request=web_request,
        turns=[
            {"tool_calls": [ToolCall(
                id="call_weather_001",
                name="web_search",
                arguments={"query": "Rotterdam weather now"}
            )]},
            {"tool_result": {
                "tool_call_id": "call_weather_001",
                "content": formatted_result,
            }},
            {"assistant": "Het weer in Rotterdam is momenteel 12°C met gedeeltelijk bewolkte lucht \\ue202turn0search0. De wind komt uit het westen met 15 km/u en de luchtvochtigheid is 72%.\n\nVanavond zakt de temperatuur naar ongeveer 8°C \\ue202turn0search0."}
        ]
    )
    
    print("\n--- Multi-turn Messages ---")
    for i, msg in enumerate(multi_turn.messages):
        role = msg["role"]
        if role == "system":
            print(f"[{i}] system: (system prompt, {len(msg['content'])} chars)")
        elif role == "user":
            print(f"[{i}] user: {msg['content']}")
        elif role == "assistant" and "tool_calls" in msg:
            tc = msg["tool_calls"][0]
            print(f"[{i}] assistant (tool_call): {tc['function']['name']}({tc['function']['arguments']})")
        elif role == "tool":
            print(f"[{i}] tool [{msg['tool_call_id']}]: {msg['content'][:80]}...")
        elif role == "assistant":
            print(f"[{i}] assistant: {msg['content'][:80]}...")
    
    # Example 5: File Search Result Formatting
    print("\n" + "=" * 60)
    print("EXAMPLE 5: File Search Result")
    print("=" * 60)
    
    file_result = FileSearchResult(
        matches=[
            FileSearchMatch(
                filename="report.pdf",
                content="Renewable energy adoption increased by 15% in 2024. Key factors include government subsidies and falling solar panel costs.",
                page="12",
                relevance=0.92,
            ),
            FileSearchMatch(
                filename="report.pdf",
                content="Solar panel installations grew by 22% compared to the previous year, with residential installations leading the growth.",
                page="15",
                relevance=0.87,
            ),
            FileSearchMatch(
                filename="data.xlsx",
                content="Total renewable capacity reached 45.2 GW by end of 2024.",
                page="Summary",
                relevance=0.81,
            ),
        ]
    )
    
    file_search_output = builder.format_file_search_result(file_result)
    print("\n--- File Search Result ---")
    print(file_search_output)
    
    # Example 6: 2-Step MCP Tool Pattern
    print("\n" + "=" * 60)
    print("EXAMPLE 6: 2-Step MCP Search Pattern (Multi-turn)")
    print("=" * 60)
    
    step1_result = """📚 DOCUMENT DISCOVERY - Relevant Documents Found:
================================================================================

📄 **Document ID: 39248184**
   Title: Besluit stralingsbescherming
   Relevance Score: 0.8542
   Matching Chunks: 3

📄 **Document ID: 39248190**
   Title: Kernenergiewet
   Relevance Score: 0.7823
   Matching Chunks: 2

📋 **SUMMARY: Found 2 unique document(s)**
**Document IDs for STEP 2:** [39248184, 39248190]

💡 **Next Step:** Use 'zoek_in_specifieke_wetgeving' with the document IDs above."""
    
    step2_result = """Retrieved context from Besluit stralingsbescherming:

📄 Document ID: 39248184
Besluit stralingsbescherming (Pages: 12, 15, 18)
URL: https://wetten.overheid.nl/BWBR0012702

Artikel 4.1 - Dosislimieten voor werknemers:
De effectieve dosis voor een werknemer mag niet meer bedragen dan 20 mSv per kalenderjaar \\ue202turn1search0.

Artikel 4.2 - Dosislimieten voor ooglenzen:
De equivalente dosis voor de ooglens mag niet meer bedragen dan 20 mSv per kalenderjaar \\ue202turn1search0."""
    
    mcp_multi_turn = builder.build_multi_turn_request(
        initial_request=request,  # MCP request from Example 1
        turns=[
            {"tool_calls": [ToolCall(
                id="call_step1",
                name="zoek_documenten_nederlandse_wetgeving__mcp__neo-search-server",
                arguments={"question": "dosislimieten werknemers", "num_results": 5}
            )]},
            {"tool_result": {
                "tool_call_id": "call_step1",
                "content": step1_result,
            }},
            {"tool_calls": [ToolCall(
                id="call_step2",
                name="zoek_in_specifieke_wetgeving__mcp__neo-search-server",
                arguments={"question": "dosislimieten werknemers", "doc_ids": [39248184, 39248190], "num_results": 10}
            )]},
            {"tool_result": {
                "tool_call_id": "call_step2",
                "content": step2_result,
            }},
            {"assistant": "De dosislimieten voor werknemers in Nederland zijn vastgelegd in het Besluit stralingsbescherming \\ue202turn1search0:\n\n1. **Effectieve dosis**: maximaal 20 mSv per kalenderjaar\n2. **Ooglens**: maximaal 20 mSv per kalenderjaar\n\nDeze limieten zijn gebaseerd op internationale aanbevelingen van de ICRP."}
        ]
    )
    
    print("\n--- 2-Step MCP Conversation Flow ---")
    for i, msg in enumerate(mcp_multi_turn.messages):
        role = msg["role"]
        if role == "system":
            print(f"[{i}] system: (system prompt)")
        elif role == "user":
            print(f"[{i}] user: {msg['content'][:60]}...")
        elif role == "assistant" and "tool_calls" in msg:
            tc = msg["tool_calls"][0]
            print(f"[{i}] assistant (tool_call): {tc['function']['name']}")
            print(f"    args: {tc['function']['arguments'][:60]}...")
        elif role == "tool":
            print(f"[{i}] tool [{msg['tool_call_id']}]:")
            print(f"    {msg['content'][:60]}...")
        elif role == "assistant":
            print(f"[{i}] assistant (final):")
            print(f"    {msg['content'][:60]}...")
    
    # Example 7: Full export for Ragas
    print("\n" + "=" * 60)
    print("EXAMPLE 7: Export for Ragas Integration (Multi-turn)")
    print("=" * 60)
    
    ragas_export = {
        "system_prompt": multi_turn.system_prompt,
        "messages": multi_turn.messages,
        "tools": [t["function"]["name"] for t in multi_turn.tools],
        "model": multi_turn.model,
        "temperature": multi_turn.temperature,
    }
    print("\n--- Ragas Export (JSON, truncated) ---")
    export_str = json.dumps(ragas_export, indent=2, ensure_ascii=False)
    print(export_str[:1000] + "\n... (truncated)")

