import { useSession } from '@/stores/session';
import { usePrApiToken } from '@/stores/prApiToken';

export function useBackendArgs() {
  const session = useSession((s) => s.session);
  const isAdmin = useSession((s) => s.isAdmin());
  const prApiToken = usePrApiToken((s) => s.token);
  const prApiIsAdmin = usePrApiToken((s) => s.isAdmin);

  const ownerId = session?.id ?? '';

  return {
    ownerId,
    pat: null as string | null,
    isAdmin,
    prApiToken,
    prApiIsAdmin,
  };
}
