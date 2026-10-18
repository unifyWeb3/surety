import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Every page here reads a live chain. Static optimisation would happily ship a cached
	// "verdict" to a reader, which in this product is the one mistake that matters most, so
	// caching is opted out of deliberately rather than tuned.
	cacheComponents: false,
	poweredByHeader: false,
};

export default nextConfig;
