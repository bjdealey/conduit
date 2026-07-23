/// <reference types="vite/client" />

declare module "*.html?raw" {
  const content: string;
  export default content;
}

declare module "*.svg?raw" {
  const content: string;
  export default content;
}
