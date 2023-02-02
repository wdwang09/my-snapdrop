export type FileInfo = {
  name: string;
  type: string;
  size: number;
};

export class FileChunkGenerator {
  private file: File;
  private reader: FileReader;
  private onChunk: (chunk: ArrayBuffer) => void;
  private onPartitionEnd: (offset: number) => void;

  private offset = 0;
  private partitionSize = 0;
  private readonly chunkSize = 64000; // 64 KB
  private readonly maxPartitionSize = 1e6; // 1 MB

  constructor(
    file: File,
    onChunk: (chunk: ArrayBuffer) => void,
    onPartitionEnd: (offset: number) => void
  ) {
    this.file = file;
    this.onChunk = onChunk;
    this.onPartitionEnd = onPartitionEnd;
    this.reader = new FileReader();
    this.reader.addEventListener("load", (e) =>
      this.onChunkRead(e.target!.result as ArrayBuffer)
    );
  }

  public nextPartition() {
    this.partitionSize = 0;
    this.readChunk();
  }

  private readChunk() {
    const chunk = this.file.slice(this.offset, this.offset + this.chunkSize);
    this.reader.readAsArrayBuffer(chunk);
  }

  private onChunkRead(chunk: ArrayBuffer) {
    this.offset += chunk.byteLength;
    this.partitionSize += chunk.byteLength;
    this.onChunk(chunk);
    if (this.isFileEnd()) return;
    if (this.isPartitionEnd()) {
      this.onPartitionEnd(this.offset);
      return;
    }
    this.readChunk();
  }

  private repeatPartition() {
    this.offset -= this.partitionSize;
    this.nextPartition();
  }

  private isPartitionEnd() {
    return this.partitionSize >= this.maxPartitionSize;
  }

  public isFileEnd() {
    return this.offset >= this.file.size;
  }

  public get progress() {
    return this.offset / this.file.size;
  }
}

export class FileDigester {
  private buffer: ArrayBuffer[] = [];
  private bytesReceived: number = 0;
  private progress: number = 0;
  private size: number;
  private type: string;
  private name: string;
  // private callback: (fileInfo: FileInfo, blob: Blob) => void;

  constructor(
    fileInfo: FileInfo
    // callback: (fileInfo: FileInfo, blob: Blob) => void
  ) {
    this.size = fileInfo.size;
    this.type = fileInfo.type || "application/octet-stream";
    this.name = fileInfo.name;
    // this.callback = callback;
  }

  public getChunk(chunk: ArrayBuffer) {
    this.buffer.push(chunk);
    this.bytesReceived += chunk.byteLength;
    // const totalChunks = this.buffer.length;
    this.progress = this.bytesReceived / this.size;
    if (isNaN(this.progress)) this.progress = 1;

    if (this.bytesReceived < this.size) return;
    // we are done
    const blob = new Blob(this.buffer, { type: this.type });

    // this.callback({
    //       name: this.name,
    //       type: this.type,
    //       size: this.size,
    // },
    // blob);

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = this.name;
    link.click();
  }

  public getProgress() {
    return this.progress;
  }
}
