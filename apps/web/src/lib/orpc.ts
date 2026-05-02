import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouter, ContractRouterClient } from "@llm-wiki/types";

const rpcLink = new RPCLink({
  url: "http://localhost:3001/rpc",
});

// We use ContractRouterClient to transform the contract definition into a client-compatible type
export const orpcClient = createORPCClient<ContractRouterClient<AppRouter>>(rpcLink);

export const orpc = createTanstackQueryUtils(orpcClient);
