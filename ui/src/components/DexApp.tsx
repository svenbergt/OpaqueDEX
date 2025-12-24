import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { ethers } from 'ethers';
import { formatUnits, isAddress, parseUnits } from 'viem';

import { Header } from './Header';
import { publicClient } from '../config/viem';
import { DEFAULT_ADDRESSES, SWAP_ABI, TOKEN_ABI } from '../config/contracts';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import '../styles/DexApp.css';

const ZERO_HANDLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
const DECIMALS = 6;
const RATE = 3100n;

type TokenKey = 'weth' | 'wusdt';

type Addresses = {
  swap: string;
  weth: string;
  wusdt: string;
};

type EncryptedBalances = {
  weth: string | null;
  wusdt: string | null;
};

type DecryptedBalances = {
  weth: bigint | null;
  wusdt: bigint | null;
};

type OperatorStatus = {
  weth: boolean;
  wusdt: boolean;
};

export function DexApp() {
  const { address, isConnected } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: isZamaLoading, error: zamaError } = useZamaInstance();

  const [addresses, setAddresses] = useState<Addresses>(DEFAULT_ADDRESSES);
  const [encryptedBalances, setEncryptedBalances] = useState<EncryptedBalances>({
    weth: null,
    wusdt: null,
  });
  const [decryptedBalances, setDecryptedBalances] = useState<DecryptedBalances>({
    weth: null,
    wusdt: null,
  });
  const [operatorStatus, setOperatorStatus] = useState<OperatorStatus>({
    weth: false,
    wusdt: false,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState<TokenKey | null>(null);
  const [swapDirection, setSwapDirection] = useState<'wethToWusdt' | 'wusdtToWeth'>('wethToWusdt');
  const [swapAmount, setSwapAmount] = useState('');
  const [mintAmounts, setMintAmounts] = useState({ weth: '', wusdt: '' });
  const [operatorDays, setOperatorDays] = useState('30');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const addressesReady = useMemo(() => {
    return isAddress(addresses.swap) && isAddress(addresses.weth) && isAddress(addresses.wusdt);
  }, [addresses]);

  const typedAddresses = useMemo(() => {
    if (!addressesReady) {
      return null;
    }
    return {
      swap: addresses.swap as `0x${string}`,
      weth: addresses.weth as `0x${string}`,
      wusdt: addresses.wusdt as `0x${string}`,
    };
  }, [addressesReady, addresses]);

  const updateAddress = (key: keyof Addresses, value: string) => {
    setAddresses((prev) => ({ ...prev, [key]: value.trim() }));
  };

  const resetDecrypted = useCallback(() => {
    setDecryptedBalances({ weth: null, wusdt: null });
  }, []);

  const refreshOnChainData = useCallback(async () => {
    if (!address || !typedAddresses) {
      return;
    }

    setIsRefreshing(true);
    setStatusMessage(null);
    try {
      const [wethBalance, wusdtBalance, wethOperator, wusdtOperator] = await Promise.all([
        publicClient.readContract({
          address: typedAddresses.weth,
          abi: TOKEN_ABI,
          functionName: 'confidentialBalanceOf',
          args: [address],
        }),
        publicClient.readContract({
          address: typedAddresses.wusdt,
          abi: TOKEN_ABI,
          functionName: 'confidentialBalanceOf',
          args: [address],
        }),
        publicClient.readContract({
          address: typedAddresses.weth,
          abi: TOKEN_ABI,
          functionName: 'isOperator',
          args: [address, typedAddresses.swap],
        }),
        publicClient.readContract({
          address: typedAddresses.wusdt,
          abi: TOKEN_ABI,
          functionName: 'isOperator',
          args: [address, typedAddresses.swap],
        }),
      ]);

      setEncryptedBalances({
        weth: String(wethBalance),
        wusdt: String(wusdtBalance),
      });
      setOperatorStatus({
        weth: Boolean(wethOperator),
        wusdt: Boolean(wusdtOperator),
      });
      resetDecrypted();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to refresh on-chain data');
    } finally {
      setIsRefreshing(false);
    }
  }, [address, typedAddresses, resetDecrypted]);

  useEffect(() => {
    if (address && typedAddresses) {
      refreshOnChainData();
    }
  }, [address, typedAddresses, refreshOnChainData]);

  const decryptBalance = async (token: TokenKey) => {
    if (!address || !typedAddresses || !instance) {
      setStatusMessage('Connect wallet and initialize encryption to decrypt balances.');
      return;
    }

    const handle = encryptedBalances[token];
    if (!handle || handle === ZERO_HANDLE) {
      setStatusMessage('Encrypted balance not available yet.');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setStatusMessage('Signer not available.');
      return;
    }

    setIsDecrypting(token);
    setStatusMessage(null);

    try {
      const keypair = instance.generateKeypair();
      const contractAddress = token === 'weth' ? typedAddresses.weth : typedAddresses.wusdt;
      const handleContractPairs = [{ handle, contractAddress }];
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [contractAddress];
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const clearValue = result[handle];
      const normalized = typeof clearValue === 'bigint' ? clearValue : BigInt(clearValue);

      setDecryptedBalances((prev) => ({ ...prev, [token]: normalized }));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to decrypt balance');
    } finally {
      setIsDecrypting(null);
    }
  };

  const buildSwapPreview = () => {
    if (!swapAmount) {
      return null;
    }
    try {
      const value = parseUnits(swapAmount, DECIMALS);
      if (swapDirection === 'wethToWusdt') {
        return formatUnits(value * RATE, DECIMALS);
      }
      return formatUnits(value / RATE, DECIMALS);
    } catch (error) {
      return null;
    }
  };

  const executeSwap = async () => {
    if (!address || !typedAddresses || !instance) {
      setStatusMessage('Connect wallet and initialize encryption before swapping.');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setStatusMessage('Signer not available.');
      return;
    }

    let amount: bigint;
    try {
      amount = parseUnits(swapAmount || '0', DECIMALS);
    } catch (error) {
      setStatusMessage('Invalid swap amount.');
      return;
    }

    if (amount <= 0n) {
      setStatusMessage('Enter a positive swap amount.');
      return;
    }

    setStatusMessage('Encrypting swap input...');
    try {
      const encryptedInput = await instance
        .createEncryptedInput(typedAddresses.swap, address)
        .add64(amount)
        .encrypt();

      const swap = new ethers.Contract(typedAddresses.swap, SWAP_ABI, signer);
      const tx =
        swapDirection === 'wethToWusdt'
          ? await swap.swapWethForWusdt(encryptedInput.handles[0], encryptedInput.inputProof)
          : await swap.swapWusdtForWeth(encryptedInput.handles[0], encryptedInput.inputProof);

      setStatusMessage('Swap submitted. Waiting for confirmation...');
      await tx.wait();
      setStatusMessage('Swap confirmed. Refreshing balances...');
      await refreshOnChainData();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Swap failed');
    }
  };

  const setOperatorForToken = async (token: TokenKey) => {
    if (!address || !typedAddresses) {
      setStatusMessage('Connect wallet and set contract addresses first.');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setStatusMessage('Signer not available.');
      return;
    }

    const days = Number(operatorDays);
    if (!Number.isFinite(days) || days <= 0) {
      setStatusMessage('Operator duration must be a positive number of days.');
      return;
    }

    const tokenAddress = token === 'weth' ? typedAddresses.weth : typedAddresses.wusdt;
    const until = BigInt(Math.floor(Date.now() / 1000) + Math.floor(days * 86400));

    try {
      const tokenContract = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
      const tx = await tokenContract.setOperator(typedAddresses.swap, until);
      setStatusMessage('Operator update submitted.');
      await tx.wait();
      setStatusMessage('Operator updated.');
      await refreshOnChainData();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to set operator');
    }
  };

  const mintTokens = async (token: TokenKey) => {
    if (!address || !typedAddresses) {
      setStatusMessage('Connect wallet and set contract addresses first.');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setStatusMessage('Signer not available.');
      return;
    }

    const rawAmount = token === 'weth' ? mintAmounts.weth : mintAmounts.wusdt;
    let amount: bigint;
    try {
      amount = parseUnits(rawAmount || '0', DECIMALS);
    } catch (error) {
      setStatusMessage('Invalid mint amount.');
      return;
    }

    if (amount <= 0n) {
      setStatusMessage('Enter a positive mint amount.');
      return;
    }

    const tokenAddress = token === 'weth' ? typedAddresses.weth : typedAddresses.wusdt;
    try {
      const tokenContract = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
      const tx = await tokenContract.mint(address, amount);
      setStatusMessage('Mint submitted.');
      await tx.wait();
      setStatusMessage('Mint confirmed.');
      await refreshOnChainData();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Mint failed');
    }
  };

  const renderEncrypted = (handle: string | null) => {
    if (!handle || handle === ZERO_HANDLE) {
      return 'Uninitialized';
    }
    return `${handle.slice(0, 10)}...${handle.slice(-8)}`;
  };

  const formatClear = (value: bigint | null) => {
    if (value === null) {
      return '***';
    }
    return formatUnits(value, DECIMALS);
  };

  const swapPreview = buildSwapPreview();

  return (
    <div className="dex-app">
      <Header />
      <main className="dex-main">
        <section className="dex-card address-card">
          <h2>Contract Addresses</h2>
          <p className="muted">
            Paste the Sepolia deployment addresses. Values are kept in memory only.
          </p>
          <div className="address-grid">
            <label>
              Swap
              <input
                type="text"
                value={addresses.swap}
                onChange={(event) => updateAddress('swap', event.target.value)}
                placeholder="0x..."
              />
            </label>
            <label>
              wETH
              <input
                type="text"
                value={addresses.weth}
                onChange={(event) => updateAddress('weth', event.target.value)}
                placeholder="0x..."
              />
            </label>
            <label>
              wUSDT
              <input
                type="text"
                value={addresses.wusdt}
                onChange={(event) => updateAddress('wusdt', event.target.value)}
                placeholder="0x..."
              />
            </label>
          </div>
          <button
            className="primary"
            onClick={refreshOnChainData}
            disabled={!isConnected || !addressesReady || isRefreshing}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh Balances'}
          </button>
        </section>

        <section className="dex-card balance-card">
          <div className="card-header">
            <h2>Encrypted Balances</h2>
            <span className="badge">Decimals: {DECIMALS}</span>
          </div>
          <div className="balance-grid">
            {(['weth', 'wusdt'] as TokenKey[]).map((token) => (
              <div key={token} className="balance-item">
                <div className="balance-title">
                  <span>{token === 'weth' ? 'wETH' : 'wUSDT'}</span>
                  <span className={`status ${operatorStatus[token] ? 'ok' : 'warn'}`}>
                    {operatorStatus[token] ? 'Operator ready' : 'Operator missing'}
                  </span>
                </div>
                <div className="balance-row">
                  <span className="label">Encrypted</span>
                  <span className="value mono">{renderEncrypted(encryptedBalances[token])}</span>
                </div>
                <div className="balance-row">
                  <span className="label">Decrypted</span>
                  <span className="value">{formatClear(decryptedBalances[token])}</span>
                </div>
                <button
                  className="ghost"
                  onClick={() => decryptBalance(token)}
                  disabled={isDecrypting === token || !instance || !isConnected}
                >
                  {isDecrypting === token ? 'Decrypting...' : 'Decrypt'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="dex-card swap-card">
          <div className="card-header">
            <h2>Fixed-Rate Swap</h2>
            <span className="badge">1 wETH = 3100 wUSDT</span>
          </div>
          <div className="swap-toggle">
            <button
              className={swapDirection === 'wethToWusdt' ? 'active' : ''}
              onClick={() => setSwapDirection('wethToWusdt')}
            >
              wETH -{'>'} wUSDT
            </button>
            <button
              className={swapDirection === 'wusdtToWeth' ? 'active' : ''}
              onClick={() => setSwapDirection('wusdtToWeth')}
            >
              wUSDT -{'>'} wETH
            </button>
          </div>
          <label className="swap-input">
            Amount
            <input
              type="text"
              value={swapAmount}
              onChange={(event) => setSwapAmount(event.target.value)}
              placeholder={`0.${'0'.repeat(DECIMALS - 1)}1`}
            />
          </label>
          <div className="swap-preview">
            <span className="label">Estimated output</span>
            <span className="value">
              {swapPreview ? `${swapPreview} ${swapDirection === 'wethToWusdt' ? 'wUSDT' : 'wETH'}` : '-'}
            </span>
          </div>
          <button
            className="primary"
            onClick={executeSwap}
            disabled={!isConnected || !addressesReady || !swapAmount}
          >
            Swap
          </button>
          {!operatorStatus[swapDirection === 'wethToWusdt' ? 'weth' : 'wusdt'] ? (
            <p className="muted">
              Set the swap contract as operator before swapping.
            </p>
          ) : null}
        </section>

        <section className="dex-card actions-card">
          <div className="card-header">
            <h2>Operator & Mint</h2>
            <span className="badge">For testing</span>
          </div>
          <label className="operator-input">
            Operator duration (days)
            <input
              type="number"
              min="1"
              value={operatorDays}
              onChange={(event) => setOperatorDays(event.target.value)}
            />
          </label>
          <div className="operator-actions">
            <button
              className="ghost"
              onClick={() => setOperatorForToken('weth')}
              disabled={!isConnected || !addressesReady}
            >
              Set wETH Operator
            </button>
            <button
              className="ghost"
              onClick={() => setOperatorForToken('wusdt')}
              disabled={!isConnected || !addressesReady}
            >
              Set wUSDT Operator
            </button>
          </div>

          <div className="mint-grid">
            <label>
              Mint wETH
              <input
                type="text"
                value={mintAmounts.weth}
                onChange={(event) => setMintAmounts((prev) => ({ ...prev, weth: event.target.value }))}
                placeholder={`10.${'0'.repeat(DECIMALS)}`}
              />
              <button
                className="ghost"
                onClick={() => mintTokens('weth')}
                disabled={!isConnected || !addressesReady}
              >
                Mint wETH
              </button>
            </label>
            <label>
              Mint wUSDT
              <input
                type="text"
                value={mintAmounts.wusdt}
                onChange={(event) => setMintAmounts((prev) => ({ ...prev, wusdt: event.target.value }))}
                placeholder={`100.${'0'.repeat(DECIMALS)}`}
              />
              <button
                className="ghost"
                onClick={() => mintTokens('wusdt')}
                disabled={!isConnected || !addressesReady}
              >
                Mint wUSDT
              </button>
            </label>
          </div>
        </section>
      </main>

      <footer className="dex-footer">
        <div className="status-panel">
          <span className={`dot ${isConnected ? 'ok' : 'warn'}`} />
          <span>{isConnected ? 'Wallet connected' : 'Connect wallet to begin'}</span>
        </div>
        <div className="status-panel">
          <span className={`dot ${instance ? 'ok' : 'warn'}`} />
          <span>{isZamaLoading ? 'Initializing encryption...' : instance ? 'Encryption ready' : 'Encryption not ready'}</span>
        </div>
        {zamaError ? <div className="status-error">{zamaError}</div> : null}
        {statusMessage ? <div className="status-error">{statusMessage}</div> : null}
      </footer>
    </div>
  );
}
