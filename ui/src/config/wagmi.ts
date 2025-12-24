import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { createStorage, noopStorage } from 'wagmi';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'OpaqueDEX',
  projectId: 'YOUR_PROJECT_ID', // WalletConnect project id
  chains: [sepolia],
  ssr: false,
  storage: createStorage({ storage: noopStorage }),
});
