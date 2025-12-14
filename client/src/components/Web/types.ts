import type { SearchRefType } from 'librechat-data-provider';
import type { CitationOrigin } from '~/@types/citations';

export type Citation = {
  turn: number;
  refType: SearchRefType | string;
  index: number;
  origin?: CitationOrigin;
};

export type CitationProps = {
  citationId?: string | null;
  citationType?: string;
  citations?: Array<Citation>;
  citation?: Citation;
  // Data attributes for rehype-raw serialization
  'data-citation'?: string;
  'data-citations'?: string;
  'data-citation-type'?: string;
  'data-citation-id'?: string;
};

export type CitationNode = {
  type?: string;
  value?: string;
  data?: {
    hName?: string;
    hProperties?: CitationProps;
  };
  children?: Array<CitationNode>;
};

export interface Sitelink {
  title: string;
  link: string;
}

export interface Reference {
  title: string;
  link: string;
  snippet: string;
  sitelinks?: Sitelink[];
  attribution: string;
}
