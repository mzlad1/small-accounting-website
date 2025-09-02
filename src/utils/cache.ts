// Cache utility for localStorage management
export interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export class CacheManager {
  private static readonly CACHE_PREFIX = "construction_app_";
  private static readonly DEFAULT_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  /**
   * Set data in cache with optional expiration
   */
  static set<T>(
    key: string,
    data: T,
    expiryMs: number = this.DEFAULT_EXPIRY
  ): void {
    try {
      const cacheItem: CacheItem<T> = {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + expiryMs,
      };
      localStorage.setItem(this.CACHE_PREFIX + key, JSON.stringify(cacheItem));
    } catch (error) {
      console.warn("Failed to set cache:", error);
    }
  }

  /**
   * Get data from cache if not expired
   */
  static get<T>(key: string): T | null {
    try {
      const cached = localStorage.getItem(this.CACHE_PREFIX + key);
      if (!cached) return null;

      const cacheItem: CacheItem<T> = JSON.parse(cached);

      // Check if cache is expired
      if (Date.now() > cacheItem.expiresAt) {
        this.remove(key);
        return null;
      }

      return cacheItem.data;
    } catch (error) {
      console.warn("Failed to get cache:", error);
      return null;
    }
  }

  /**
   * Remove specific cache item
   */
  static remove(key: string): void {
    try {
      localStorage.removeItem(this.CACHE_PREFIX + key);
    } catch (error) {
      console.warn("Failed to remove cache:", error);
    }
  }

  /**
   * Clear all app cache
   */
  static clearAll(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith(this.CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn("Failed to clear cache:", error);
    }
  }

  /**
   * Check if cache exists and is valid
   */
  static has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Get cache age in milliseconds
   */
  static getAge(key: string): number | null {
    try {
      const cached = localStorage.getItem(this.CACHE_PREFIX + key);
      if (!cached) return null;

      const cacheItem: CacheItem<any> = JSON.parse(cached);
      return Date.now() - cacheItem.timestamp;
    } catch (error) {
      return null;
    }
  }

  /**
   * Update specific item in cached array
   */
  static updateArrayItem<T extends { id: string }>(
    key: string,
    itemId: string,
    updatedItem: T
  ): void {
    try {
      const cached = this.get<T[]>(key);
      if (!cached) return;

      const updatedArray = cached.map((item) =>
        item.id === itemId ? updatedItem : item
      );
      this.set(key, updatedArray);
    } catch (error) {
      console.warn("Failed to update array item in cache:", error);
    }
  }

  /**
   * Add new item to cached array
   */
  static addArrayItem<T extends { id: string }>(key: string, newItem: T): void {
    try {
      const cached = this.get<T[]>(key);
      if (!cached) return;

      const updatedArray = [...cached, newItem];
      this.set(key, updatedArray);
    } catch (error) {
      console.warn("Failed to add array item to cache:", error);
    }
  }

  /**
   * Remove item from cached array
   */
  static removeArrayItem<T extends { id: string }>(
    key: string,
    itemId: string
  ): void {
    try {
      const cached = this.get<T[]>(key);
      if (!cached) return;

      const updatedArray = cached.filter((item) => item.id !== itemId);
      this.set(key, updatedArray);
    } catch (error) {
      console.warn("Failed to remove array item from cache:", error);
    }
  }

  /**
   * Cache keys for different data types
   */
  static readonly KEYS = {
    CUSTOMERS: "customers",
    ORDERS: "orders",
    PAYMENTS: "payments",
    CHECKS: "checks",
    SUPPLIERS: "suppliers",
    ORDER_ITEMS: "order_items",
    SUPPLIER_ELEMENTS: "supplier_elements",
    CUSTOMER_ACCOUNT: "customer_account_", // Will append customer ID
    ORDER_DETAILS: "order_details_", // Will append order ID
    SUPPLIER_DETAILS: "supplier_details_", // Will append supplier ID
  } as const;
}

// Helper function to create cache key with ID
export const createCacheKey = (baseKey: string, id: string): string => {
  return `${baseKey}${id}`;
};

// Helper function to check if we should use cache or fetch fresh data
export const shouldUseCache = (
  key: string,
  maxAgeMs: number = 5 * 60 * 1000
): boolean => {
  const age = CacheManager.getAge(key);
  return age !== null && age < maxAgeMs;
};
