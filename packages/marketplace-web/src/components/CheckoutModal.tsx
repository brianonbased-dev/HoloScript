'use client';

import { useState } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import { Loader2, AlertCircle, CheckCircle, Wallet, X } from 'lucide-react';
import type { TraitSummary } from '@/types';

interface CheckoutModalProps {
  trait: TraitSummary;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CheckoutModal({ trait, isOpen, onClose, onSuccess }: CheckoutModalProps) {
  const { isConnected, address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [status, setStatus] = useState<'idle' | 'signing' | 'processing' | 'success' | 'error'>(
    'idle'
  );
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const mockPrice = '0.015 ETH'; // Hardcoded mock for demonstration

  const handleCheckout = async () => {
    if (!isConnected) {
      setErrorMessage('Please connect your wallet first');
      setStatus('error');
      return;
    }

    try {
      setStatus('signing');

      // EIP-712 Signature (Simulating x402PaymentService challenge)
      const domain = {
        name: 'HoloScript Marketplace',
        version: '1',
        chainId: 8453,
        verifyingContract: '0x0000000000000000000000000000000000000000' as const,
      };

      const types = {
        Purchase: [
          { name: 'traitId', type: 'string' },
          { name: 'buyer', type: 'address' },
          { name: 'price', type: 'string' },
        ],
      } as const;

      const message = {
        traitId: trait.id,
        buyer: address as `0x${string}`,
        price: mockPrice,
      };

      await signTypedDataAsync({
        domain,
        types,
        primaryType: 'Purchase',
        message,
      });

      setStatus('processing');

      // Simulate backend M2M transaction finalizing
      setTimeout(() => {
        setStatus('success');
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      }, 2000);
    } catch (err: unknown) {
      console.error('Checkout failed:', err);
      setErrorMessage(
        (err instanceof Error ? err.message : String(err)) ||
          'Signature rejected or transaction failed'
      );
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Checkout</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
            <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">{trait.name}</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">By {trait.author.name}</p>
            <div className="flex justify-between items-center text-lg font-bold text-holoscript-600 dark:text-holoscript-400">
              <span>Total:</span>
              <span>{mockPrice}</span>
            </div>
          </div>

          {status === 'error' && (
            <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg flex items-start gap-2 text-sm">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p>{errorMessage}</p>
            </div>
          )}

          {status === 'success' ? (
            <div className="flex flex-col items-center justify-center py-6 text-green-600 dark:text-green-500">
              <CheckCircle className="h-12 w-12 mb-3" />
              <p className="font-medium text-lg">Purchase Complete!</p>
            </div>
          ) : (
            <button
              onClick={handleCheckout}
              disabled={status === 'signing' || status === 'processing'}
              className="w-full py-3 px-4 bg-holoscript-500 hover:bg-holoscript-600 text-white rounded-xl font-semibold transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
            >
              {status === 'idle' || status === 'error' ? (
                <>
                  <Wallet className="h-5 w-5" />
                  Sign & Pay
                </>
              ) : (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {status === 'signing' ? 'Awaiting Signature...' : 'Processing...'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
