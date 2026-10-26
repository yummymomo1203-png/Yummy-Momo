/* Separate shop configuration. Public browser-safe values only; never use a service-role key. */
const RESTAURANT_CONFIG = {
  publicMenuUrl: "", // Blank uses this deployment for table QR links.
  restaurantName: "Yummy Momo",
  tagline: "Yummy in your tummy",
  currency: "₹",
  // Use this shop's OWN Supabase project, not another restaurant's project.
  supabaseUrl: "https://rvsxgsyhpwntmxbxtvri.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2c3hnc3locHdudG14Ynh0dnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMTY2NjUsImV4cCI6MjEwODU5MjY2NX0.vFbSu8nNDdu7Vajb-Y8RqhSde93IJiBFNGGU5EjZPb8",
  // Optional: this shop's Google review link. Blank disables the review prompt.
  googleReviewUrl: "",
  categories: ["All", "Steamed Momos", "Fried Momos", "Kurkure Momos", "Tandoori Momos", "Chutney & Dips", "Drinks", "Desserts"],
  menuItems: []
};
