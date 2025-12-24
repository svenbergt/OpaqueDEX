import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

// export const PUBLIC_RPC_URL = 'https://eth-sepolia.public.blastapi.io';

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});
