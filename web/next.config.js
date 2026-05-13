const nextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  // Allow dev access via 127.0.0.1 (Next 16 blocks cross-origin dev
  // resources by default; 127.0.0.1 is treated as cross-origin vs localhost).
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.googleusercontent.com' },
    ],
  },
};

module.exports = nextConfig;
