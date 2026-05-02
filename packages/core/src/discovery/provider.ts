import { GoogleAuth } from "google-auth-library";

export interface DiscoveryEngineConfig {
  projectId: string;
  location?: string;
  dataStoreId: string;
}

export interface DiscoverySearchResponse {
  results: Array<{
    document: {
      name: string;
      id: string;
      derivedStructData?: any;
    };
  }>;
  totalSize: number;
}

export class DiscoveryEngineProvider {
  private readonly projectId: string;
  private readonly location: string;
  private readonly dataStoreId: string;
  private readonly auth: GoogleAuth;

  constructor(config: DiscoveryEngineConfig) {
    this.projectId = config.projectId;
    this.location = config.location ?? "global";
    this.dataStoreId = config.dataStoreId;
    this.auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"]
    });
  }

  async search(query: string, pageSize: number = 5): Promise<DiscoverySearchResponse> {
    const client = await this.auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;

    if (!token) {
      throw new Error("Failed to acquire access token for Discovery Engine");
    }

    const url = `https://discoveryengine.googleapis.com/v1beta/projects/${this.projectId}/locations/${this.location}/dataStores/${this.dataStoreId}/servingConfigs/default_serving_config:search`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        pageSize,
        contentSearchSpec: {
          snippetSpec: {
            maxSnippetCount: 3
          },
          summarySpec: {
            summaryResultCount: 3,
            includeCitations: true
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Discovery Engine search failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as DiscoverySearchResponse;
  }
}
