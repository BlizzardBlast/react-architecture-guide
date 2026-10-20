import type { OrderWriter } from "../application/place-order.js";
import type { OrderReceipt } from "../domain/order.js";

function parseReceipt(payload: unknown): OrderReceipt {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("orderId" in payload) ||
    typeof payload.orderId !== "string" ||
    payload.orderId.trim() === ""
  ) {
    throw new Error("Invalid order response");
  }
  return { orderId: payload.orderId };
}

// The adapter validates untrusted JSON instead of trusting a TypeScript cast.
export function createHttpOrderWriter(
  fetcher: typeof fetch,
  baseUrl: string,
): OrderWriter {
  return {
    async create(draft) {
      const response = await fetcher(baseUrl + "/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error("Failed to create order");
      const data: unknown = await response.json();
      return parseReceipt(data);
    },
  };
}
