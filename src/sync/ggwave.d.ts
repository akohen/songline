/**
 * The slice of ggwave 0.4.0's Emscripten module this app uses. The package ships no
 * types. See docs/tech/sound-sync.md for the quirks behind these signatures.
 */
declare module "ggwave" {
  /** An embind enum value. Opaque: only ever passed back to `encode`. */
  export type GgwaveProtocol = { readonly __ggwaveProtocol: unique symbol };
  export type GgwaveInstance = number;
  export type GgwaveParameters = {
    sampleRateInp: number;
    sampleRateOut: number;
  };

  export type Ggwave = {
    getDefaultParameters(): GgwaveParameters;
    init(parameters: GgwaveParameters): GgwaveInstance;
    /** A view into a static WASM buffer, overwritten by the next call: copy it. */
    encode(
      instance: GgwaveInstance,
      payload: Uint8Array,
      protocol: GgwaveProtocol,
      volume: number,
    ): Int8Array;
    /** Same static-buffer caveat. Empty until a whole packet has been heard. */
    decode(instance: GgwaveInstance, samples: Int8Array): Int8Array;
    disableLog(): void;
    ProtocolId: { GGWAVE_PROTOCOL_ULTRASOUND_FASTEST: GgwaveProtocol };
  };

  const factory: (module?: {
    print?: (text: string) => void;
    printErr?: (text: string) => void;
  }) => Promise<Ggwave>;
  export default factory;
}
