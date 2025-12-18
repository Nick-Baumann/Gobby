export type GatewayWsLogStyle = "full" | "compact";

let gatewayWsLogStyle: GatewayWsLogStyle = "full";

export function setGatewayWsLogStyle(style: GatewayWsLogStyle): void {
  gatewayWsLogStyle = style;
}

export function getGatewayWsLogStyle(): GatewayWsLogStyle {
  return gatewayWsLogStyle;
}
