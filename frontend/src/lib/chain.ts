/**
 * Chain constants that are safe in the browser.
 *
 * Deliberately separate from `court.ts`: that module imports the genlayer-js
 * client, so a client component importing it would pull an SDK into the browser
 * bundle just to learn a chain id. Everything here is a literal.
 */

export const CHAIN = {
  id: 61997,
  name: "GenLayer Studio Dev",
  rpc: "https://studio-dev.genlayer.com/api",
  explorer: "https://explorer-studio-dev.genlayer.com",
  currency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
} as const;

/** EIP-155 chain id as the hex string every wallet RPC expects. 61997 = 0xf22d. */
export const CHAIN_HEX = "0xf22d";

/** The payload for `wallet_addEthereumChain`, for a wallet that has never seen
 *  this network. Without it, a first-time visitor's switch attempt dead-ends
 *  with an error and no way forward. */
export const CHAIN_PARAMS = {
  chainId: CHAIN_HEX,
  chainName: CHAIN.name,
  nativeCurrency: CHAIN.currency,
  rpcUrls: [CHAIN.rpc],
  blockExplorerUrls: [CHAIN.explorer],
} as const;

export const COURT_ADDRESS = (process.env.NEXT_PUBLIC_COURT_ADDRESS ??
  "0x13248E8b62CF77756dB8B743D7B8a7A6BA6BBf1a") as `0x${string}`;

/** A second instance of the same contract with five-minute deadlines instead of
 *  48 hours, so the paths that only open once a deadline passes can be watched
 *  rather than only described. Documented on /docs. */
export const FAST_COURT_ADDRESS = (process.env.NEXT_PUBLIC_FAST_COURT_ADDRESS ??
  "0x16EF19D8Bb009d0bB6a5Ba679E7Ac7Ba9B93B56c") as `0x${string}`;

export const CONSUMER_ADDRESS = (process.env.NEXT_PUBLIC_CONSUMER_ADDRESS ??
  "0x5E661B9880026723d67f03e4589d33F2decE3Fe0") as `0x${string}`;

export const GITHUB = "https://github.com/kenil1710/courtroom";

/** The canonical public URL. Vercel assigns two: this PROJECT domain, and a
 *  deployment URL behind Deployment Protection that answers 302 to anyone who
 *  is not signed in. Only the project domain is shareable. */
export const SITE = "https://courtroom-nine.vercel.app";

export const txUrl = (hash: string) => `${CHAIN.explorer}/tx/${hash}`;
export const addressUrl = (address: string) => `${CHAIN.explorer}/address/${address}`;
