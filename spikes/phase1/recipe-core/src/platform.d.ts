// The only host APIs the core may use. All are Web standards present in
// every target webview (WebView2, WKWebView, WebKitGTK, Android WebView) and
// in Node >= 19, so no DOM or Node typings are loaded (tsconfig "types": []).
interface SubtleCryptoLike {
  digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer>;
}
interface CryptoLike {
  readonly subtle: SubtleCryptoLike;
  getRandomValues<T extends Uint8Array>(array: T): T;
}
declare var crypto: CryptoLike;
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
