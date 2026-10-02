// npm i @tanstack/react-query
// In main.jsx wrap:  <QueryProvider><AuthProvider><App/></AuthProvider></QueryProvider>
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
});

export const QueryProvider = ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

/* ---- Example: replace useState + useEffect + fetch in a page ----

import { useQuery } from "@tanstack/react-query";
import { apiJson } from "../api/apiClient";

const { data = [], isLoading, error, refetch } = useQuery({
  queryKey: ["quotations", { from, to }],          // refetches when filters change
  queryFn: () => apiJson(`${BASE}/quotations?from=${from}&to=${to}`),
});
*/
