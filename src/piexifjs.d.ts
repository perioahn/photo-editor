declare module 'piexifjs' {
  const piexif: {
    load(dataURL: string): any
    dump(exifObj: any): string
    insert(exifBytes: string, dataURL: string): string
    ImageIFD: Record<string, number>
    ExifIFD: Record<string, number>
  }
  export default piexif
}
