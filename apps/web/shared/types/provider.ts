export type ProviderKind = "local_cli" | "cloud_api";

export interface Provider {
  key: string;
  display_name: string;
  kind: ProviderKind;
  executable?: string;
  supported_models?: string[];
  default_model?: string;
  capabilities?: string[];
}
