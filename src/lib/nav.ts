export interface NavItem {
  key: string;      // ACCESS map key
  href: string;
  label: string;
  icon: string;
  section: "Store" | "Catalog" | "Operations" | "Back Office";
}

export const NAV: NavItem[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: "dashboard", section: "Store" },
  { key: "pos", href: "/pos", label: "POS", icon: "pos", section: "Store" },
  { key: "customers", href: "/customers", label: "Customers", icon: "customers", section: "Store" },
  { key: "tradein", href: "/tradein", label: "Trade-In / Buylist", icon: "tradein", section: "Store" },
  { key: "preorders", href: "/preorders", label: "Preorders", icon: "preorder", section: "Store" },
  { key: "tournaments", href: "/tournaments", label: "Tournaments", icon: "tournament", section: "Store" },

  { key: "inventory", href: "/inventory", label: "Inventory", icon: "inventory", section: "Catalog" },
  { key: "singles", href: "/singles", label: "Singles", icon: "card", section: "Catalog" },
  { key: "graded", href: "/graded", label: "Graded Cards", icon: "graded", section: "Catalog" },
  { key: "lookup", href: "/lookup", label: "Card Lookup", icon: "search", section: "Catalog" },

  { key: "suppliers", href: "/suppliers", label: "Suppliers", icon: "supplier", section: "Operations" },
  { key: "purchase-orders", href: "/purchase-orders", label: "Purchase Orders", icon: "po", section: "Operations" },
  { key: "shipments", href: "/shipments", label: "Shipments", icon: "shipment", section: "Operations" },

  { key: "accounting", href: "/accounting", label: "Accounting", icon: "accounting", section: "Back Office" },
  { key: "reports", href: "/reports", label: "Reports & Analytics", icon: "reports", section: "Back Office" },
  { key: "employees", href: "/employees", label: "Employees", icon: "employees", section: "Back Office" },
  { key: "settings", href: "/settings", label: "Settings", icon: "settings", section: "Back Office" },
];
