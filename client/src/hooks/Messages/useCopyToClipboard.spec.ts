import { renderHook, act } from '@testing-library/react';
import copy from 'copy-to-clipboard';
import { ContentTypes } from 'librechat-data-provider';
import type {
  SearchResultData,
  ProcessedOrganic,
  TMessageContentParts,
} from 'librechat-data-provider';
import useCopyToClipboard from '~/hooks/Messages/useCopyToClipboard';

// Mock the copy-to-clipboard module
jest.mock('copy-to-clipboard');

describe('useCopyToClipboard', () => {
  const mockSetIsCopied = jest.fn();
  const mockCopy = copy as jest.MockedFunction<typeof copy>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Basic functionality', () => {
    it('should copy plain text without citations', () => {
      const { result } = renderHook(() =>
        useCopyToClipboard({
          text: 'Simple text without citations',
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      expect(mockCopy).toHaveBeenCalledWith('Simple text without citations', {
        format: 'text/plain',
      });
      expect(mockSetIsCopied).toHaveBeenCalledWith(true);
    });

    it('should handle content array with text types', () => {
      const content = [
        { type: ContentTypes.TEXT, text: 'First line' },
        { type: ContentTypes.TEXT, text: 'Second line' },
      ];

      const { result } = renderHook(() =>
        useCopyToClipboard({
          content: content as TMessageContentParts[],
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      expect(mockCopy).toHaveBeenCalledWith('First line\nSecond line', {
        format: 'text/plain',
      });
    });

    it('should reset isCopied after timeout', () => {
      const { result } = renderHook(() =>
        useCopyToClipboard({
          text: 'Test text',
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      expect(mockSetIsCopied).toHaveBeenCalledWith(true);

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(mockSetIsCopied).toHaveBeenCalledWith(false);
    });
  });

  describe('Citation formatting', () => {
    const mockSearchResults: { [key: string]: SearchResultData } = {
      '0': {
        organic: [
          {
            link: 'https://example.com/search1',
            title: 'Search Result 1',
            snippet: 'This is a search result',
          },
        ],
        topStories: [
          {
            link: 'https://example.com/news1',
            title: 'News Story 1',
          },
          {
            link: 'https://example.com/news2',
            title: 'News Story 2',
          },
        ],
        images: [
          {
            link: 'https://example.com/image1',
            title: 'Image 1',
          },
        ],
        videos: [
          {
            link: 'https://example.com/video1',
            title: 'Video 1',
          },
        ],
      },
    };

    it('should format standalone search citations', () => {
      const text = 'This is a fact from the source.【turn0search0】 More text.';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `This is a fact from the source.[1] More text.

Citations:
[1] https://example.com/search1
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });

    it('should format news citations with correct mapping', () => {
      const text =
        'Breaking news first story.【turn0news0】 More news second story.【turn0news1】';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `Breaking news first story.[1] More news second story.[2]

Citations:
[1] https://example.com/news1
[2] https://example.com/news2
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });

    it('should handle citation at end of sentence', () => {
      const text =
        'This is cited text.【turn0search0】 More text.';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `This is cited text.[1] More text.

Citations:
[1] https://example.com/search1
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });

    it('should handle multi-source citations (comma-separated indices)', () => {
      const text =
        'Multiple sources confirm this.【turn0search0,turn0news0,turn0news1】';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `Multiple sources confirm this.[1][2][3]

Citations:
[1] https://example.com/search1
[2] https://example.com/news1
[3] https://example.com/news2
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });
  });

  describe('Citation deduplication', () => {
    it('should use same number for duplicate URLs', () => {
      const mockSearchResultsWithDupes: { [key: string]: SearchResultData } = {
        '0': {
          organic: [
            {
              link: 'https://example.com/article',
              title: 'Article from search',
            },
          ],
          topStories: [
            {
              link: 'https://example.com/article', // Same URL
              title: 'Article from news',
            },
          ],
        },
      };

      const text =
        'First citation from search.【turn0search0】 Second from news.【turn0news0】';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResultsWithDupes,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `First citation from search.[1] Second from news.[1]

Citations:
[1] https://example.com/article
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });

    it('should handle multiple citations of the same source', () => {
      const mockSearchResults: { [key: string]: SearchResultData } = {
        '0': {
          organic: [
            {
              link: 'https://example.com/source1',
              title: 'Source 1',
            },
          ],
        },
      };

      const text =
        'First mention fact one.【turn0search0】 Second mention fact two.【turn0search0】 Third fact three.【turn0search0】';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `First mention fact one.[1] Second mention fact two.[1] Third fact three.[1]

Citations:
[1] https://example.com/source1
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });
  });

  describe('Edge cases', () => {
    it('should handle missing search results gracefully', () => {
      const text = 'Text with citation.【turn0search0】 No data.';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: {},
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      // Citation tag should be removed
      expect(mockCopy).toHaveBeenCalledWith('Text with citation. No data.', {
        format: 'text/plain',
      });
    });

    it('should handle invalid citation indices', () => {
      const mockSearchResults: { [key: string]: SearchResultData } = {
        '0': {
          organic: [
            {
              link: 'https://example.com/search1',
              title: 'Search Result 1',
            },
          ],
        },
      };

      const text =
        'Valid citation.【turn0search0】 Invalid ref.【turn0search5】';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      // Invalid citation removed, valid citation gets reference
      const expectedText = `Valid citation.[1] Invalid ref.

Citations:
[1] https://example.com/search1
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });

    it('should handle citations without links', () => {
      const mockSearchResults: { [key: string]: SearchResultData } = {
        '0': {
          organic: [
            {
              title: 'No link source',
              // No link property
            } as ProcessedOrganic,
          ],
        },
      };

      const text = 'Citation without link.【turn0search0】';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      // Citation tag removed when source has no link
      expect(mockCopy).toHaveBeenCalledWith('Citation without link.', {
        format: 'text/plain',
      });
    });

    it('should clean up orphaned citation lists at the end', () => {
      const mockSearchResults: { [key: string]: SearchResultData } = {
        '0': {
          organic: [
            { link: 'https://example.com/1', title: 'Source 1' },
            { link: 'https://example.com/2', title: 'Source 2' },
          ],
        },
      };

      const text = 'Text with citations.【turn0search0】\n\n[1][2]';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `Text with citations.[1]

Citations:
[1] https://example.com/1
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });
  });

  describe('All citation types', () => {
    const mockSearchResults: { [key: string]: SearchResultData } = {
      '0': {
        organic: [{ link: 'https://example.com/search', title: 'Search' }],
        topStories: [{ link: 'https://example.com/news', title: 'News' }],
        images: [{ link: 'https://example.com/image', title: 'Image' }],
        videos: [{ link: 'https://example.com/video', title: 'Video' }],
        references: [{ link: 'https://example.com/ref', title: 'Reference', type: 'link' }],
      },
    };

    it('should handle all citation types correctly', () => {
      const text =
        'Search.【turn0search0】 News.【turn0news0】 Image.【turn0image0】 Video.【turn0video0】 Ref.【turn0ref0】';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `Search.[1] News.[2] Image.[3] Video.[4] Ref.[5]

Citations:
[1] https://example.com/search
[2] https://example.com/news
[3] https://example.com/image
[4] https://example.com/video
[5] https://example.com/ref
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });
  });

  describe('Complex scenarios', () => {
    it('should handle multiple citations from multiple sources', () => {
      const mockSearchResults: { [key: string]: SearchResultData } = {
        '0': {
          organic: [
            { link: 'https://example.com/1', title: 'Source 1' },
            { link: 'https://example.com/2', title: 'Source 2' },
          ],
          topStories: [{ link: 'https://example.com/3', title: 'News 1' }],
        },
      };

      const text =
        'Cited text.【turn0search0】 Multi-source combined citation.【turn0search1,turn0news0】';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `Cited text.[1] Multi-source combined citation.[2][3]

Citations:
[1] https://example.com/1
[2] https://example.com/2
[3] https://example.com/3
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });
  });
});
