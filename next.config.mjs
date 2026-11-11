/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  turbopack: {
    root: process.cwd(),
  },
  reactCompiler: true,
  allowedDevOrigins: [
    "10.100.0.189",
    "10.100.0.107",
    "10.100.3.132",
    "gteach.local",
    "192.168.137.48",
  ],
};

export default nextConfig;
