'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export function LoginButton() {
  return <ConnectButton accountStatus="avatar" chainStatus="icon" showBalance={false} />;
}
