/** Tunables of this module (PROMPT_MESTRE 5.1: each module has its own config). */
export const contextsConfig = {
  /** Text limit of the place's address, the same as the contract and the database accept. */
  addressMaxLength: 200,
  /** The radius the stepper allows, as `contextLocationSchema` and the database check do. */
  radiusMinM: 20,
  radiusMaxM: 5000,
  /** One tap of the radius stepper. */
  radiusStepM: 50,
  /** Decimals kept from the device's reading: five is about a meter, which is plenty for a radius. */
  coordinateDecimals: 5,
} as const;
