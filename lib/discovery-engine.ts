import { GoogleAuth } from "google-auth-library";
import { getServerEnv } from "@/lib/env";

export type SearchSource = {
  title: string;
  snippet: string;
  uri?: string;
};

type SearchResponse = {
  results?: unknown[];
};

function getServingConfigPath(
  projectId: string,
  location: string,
  engineId: string,
  servingConfigId: string,
) {
  return `projects/${projectId}/locations/${location}/collections/default_collection/engines/${engineId}/servingConfigs/${servingConfigId}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function unwrapProtobufValue(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) {
    return value;
  }

  if ("stringValue" in record) {
    return record.stringValue;
  }

  if ("numberValue" in record) {
    return record.numberValue;
  }

  if ("boolValue" in record) {
    return record.boolValue;
  }

  if ("listValue" in record) {
    const list = asRecord(record.listValue);
    const values = list?.values;
    if (Array.isArray(values)) {
      return values.map((item) => unwrapProtobufValue(item));
    }
  }

  if ("structValue" in record) {
    const struct = asRecord(record.structValue);
    if (struct?.fields) {
      const unwrapped: Record<string, unknown> = {};
      for (const [key, fieldValue] of Object.entries(struct.fields)) {
        unwrapped[key] = unwrapProtobufValue(fieldValue);
      }
      return unwrapped;
    }
  }

  if ("fields" in record) {
    const fields = asRecord(record.fields);
    if (!fields) {
      return value;
    }
    const unwrapped: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(fields)) {
      unwrapped[key] = unwrapProtobufValue(fieldValue);
    }
    return unwrapped;
  }

  return value;
}

function getStructFields(value: unknown): Record<string, unknown> | null {
  const unwrapped = unwrapProtobufValue(value);
  return asRecord(unwrapped);
}

function collectTextParts(value: unknown, parts: string[]): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      parts.push(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextParts(item, parts);
    }
    return;
  }

  const record = asRecord(unwrapProtobufValue(value));
  if (!record) {
    return;
  }

  for (const key of ["content", "snippet", "text", "pageContent"]) {
    if (key in record) {
      collectTextParts(record[key], parts);
    }
  }
}

function extractTextFromField(
  data: Record<string, unknown> | null | undefined,
  key: string,
): string {
  if (!data || !(key in data)) {
    return "";
  }

  const parts: string[] = [];
  collectTextParts(data[key], parts);
  return [...new Set(parts)].join("\n");
}

function extractSourceFromResult(result: unknown): SearchSource | null {
  const searchResult = result as {
    document?: {
      derivedStructData?: unknown;
      structData?: unknown;
    };
    chunk?: {
      content?: string;
      documentMetadata?: {
        structData?: unknown;
        title?: string;
        uri?: string;
      };
    };
  };

  const derivedFields = getStructFields(searchResult.document?.derivedStructData);
  const structFields = getStructFields(searchResult.document?.structData);
  const chunkFields = getStructFields(
    searchResult.chunk?.documentMetadata?.structData,
  );

  const title =
    extractTextFromField(derivedFields, "title") ||
    extractTextFromField(structFields, "title") ||
    extractTextFromField(chunkFields, "title") ||
    searchResult.chunk?.documentMetadata?.title ||
    "参照ドキュメント";

  const snippetParts = [
    searchResult.chunk?.content ?? "",
    extractTextFromField(derivedFields, "extractive_segments"),
    extractTextFromField(derivedFields, "snippets"),
    extractTextFromField(derivedFields, "snippet"),
    extractTextFromField(derivedFields, "extractive_answers"),
    extractTextFromField(structFields, "description"),
  ].filter(Boolean);

  const snippet = [...new Set(snippetParts)].join("\n\n");

  const uri =
    extractTextFromField(derivedFields, "link") ||
    extractTextFromField(structFields, "link") ||
    extractTextFromField(chunkFields, "link") ||
    searchResult.chunk?.documentMetadata?.uri;

  if (!snippet && title === "参照ドキュメント") {
    return null;
  }

  return { title, snippet, uri: uri || undefined };
}

function extractQueryTerms(query: string): string[] {
  const terms: string[] = [];

  const lectureMatches = query.matchAll(/第\s*(\d+)\s*回/g);
  for (const match of lectureMatches) {
    terms.push(`第${match[1]}回`);
    terms.push(match[1]);
  }

  const tokens = query
    .split(/[\s、。．，,.!?！？]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  terms.push(...tokens);

  return [...new Set(terms)];
}

function scoreSource(source: SearchSource, queryTerms: string[]): number {
  const haystack = `${source.title} ${source.snippet}`.toLowerCase();
  let score = source.snippet.length > 0 ? 10 : 0;

  for (const term of queryTerms) {
    if (haystack.includes(term.toLowerCase())) {
      score += term.match(/^\d+$/) ? 20 : 8;
    }
  }

  return score;
}

function rankSources(sources: SearchSource[], query: string): SearchSource[] {
  const queryTerms = extractQueryTerms(query);

  return [...sources].sort(
    (left, right) =>
      scoreSource(right, queryTerms) - scoreSource(left, queryTerms),
  );
}

async function getAccessToken(credentialsJson: string): Promise<string> {
  const credentials = JSON.parse(credentialsJson) as {
    client_email: string;
    private_key: string;
  };

  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;

  if (!token) {
    throw new Error("Failed to obtain Google access token");
  }

  return token;
}

type ContentSearchSpec = {
  snippetSpec?: { returnSnippet: boolean };
};

// Standard edition engines do not support CHUNKS or extractiveContentSpec.
const STANDARD_SEARCH_SPECS: (ContentSearchSpec | undefined)[] = [
  { snippetSpec: { returnSnippet: true } },
  undefined,
];

async function searchWithServingConfig(
  servingConfig: string,
  query: string,
  accessToken: string,
  projectId: string,
): Promise<SearchSource[]> {
  let lastError: unknown;

  for (const contentSearchSpec of STANDARD_SEARCH_SPECS) {
    const response = await fetch(
      `https://discoveryengine.googleapis.com/v1/${servingConfig}:search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Goog-User-Project": projectId,
        },
        body: JSON.stringify({
          query,
          pageSize: 8,
          ...(contentSearchSpec ? { contentSearchSpec } : {}),
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      lastError = new Error(
        `Discovery Engine search failed (${response.status}): ${errorBody}`,
      );
      continue;
    }

    lastError = undefined;

    const data = (await response.json()) as SearchResponse;

    const sources =
      data.results
        ?.map((result) => extractSourceFromResult(result))
        .filter((source): source is SearchSource => source !== null) ?? [];

    if (sources.length > 0) {
      return rankSources(sources, query).slice(0, 5);
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}

export async function searchDocuments(
  query: string,
  engineId: string,
): Promise<SearchSource[]> {
  const env = getServerEnv();
  const accessToken = await getAccessToken(env.googleCredentialsJson);
  const servingConfigIds = ["default_config", "default_search"];
  let lastError: unknown;

  for (const servingConfigId of servingConfigIds) {
    try {
      const sources = await searchWithServingConfig(
        getServingConfigPath(
          env.gcpProjectId,
          env.discoveryEngineLocation,
          engineId,
          servingConfigId,
        ),
        query,
        accessToken,
        env.gcpProjectId,
      );

      if (sources.length > 0) {
        return sources;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}
