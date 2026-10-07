export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  bought: boolean;
  /** ISO-8601 string; null only while a server timestamp is pending. */
  createdAt: string | null;
}
