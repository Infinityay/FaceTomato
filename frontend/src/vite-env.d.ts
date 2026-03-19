/// <reference types="vite/client" />

declare module "pdfjs-dist/build/pdf.worker?url" {
  const workerSrc: string;
  export default workerSrc;
}
