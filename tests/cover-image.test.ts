import { afterEach, describe, expect, it, vi } from "vitest";
import { readCoverImage, shrinkCoverDataUrl } from "../components/library/view-utils";

const SHRUNK = "data:image/jpeg;base64,c21hbGw=";

function stubImagePipeline({ width, height, output = SHRUNK }: { width: number; height: number; output?: string }) {
  const bitmap = { width, height, close: vi.fn() };
  const createImageBitmap = vi.fn().mockResolvedValue(bitmap);
  vi.stubGlobal("createImageBitmap", createImageBitmap);
  const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context as never);
  const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(output);
  return { bitmap, createImageBitmap, context, toDataURL };
}

describe("cover image downscaling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("re-encodes a large photo as a JPEG no bigger than 600 by 900", async () => {
    const pipeline = stubImagePipeline({ width: 2400, height: 3600 });
    const photo = new File([new Uint8Array(3_000_000)], "photo.png", { type: "image/png" });

    await expect(readCoverImage(photo)).resolves.toBe(SHRUNK);
    expect(pipeline.createImageBitmap).toHaveBeenCalledWith(photo);
    expect(pipeline.context.drawImage).toHaveBeenCalledWith(pipeline.bitmap, 0, 0, 600, 900);
    expect(pipeline.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.85);
    expect(pipeline.bitmap.close).toHaveBeenCalled();
  });

  it("never enlarges an image that already fits", async () => {
    const pipeline = stubImagePipeline({ width: 300, height: 450 });
    await readCoverImage(new File([new Uint8Array(100_000)], "small.jpg", { type: "image/jpeg" }));
    expect(pipeline.context.drawImage).toHaveBeenCalledWith(pipeline.bitmap, 0, 0, 300, 450);
  });

  it("keeps the original file when re-encoding would not make it smaller", async () => {
    stubImagePipeline({ width: 300, height: 450, output: `data:image/jpeg;base64,${"A".repeat(100)}` });
    const tiny = new File(["abc"], "tiny.jpg", { type: "image/jpeg" });
    await expect(readCoverImage(tiny)).resolves.toBe("data:image/jpeg;base64,YWJj");
  });

  it("keeps the original file when the browser cannot decode it", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("unsupported")));
    const file = new File(["abc"], "cover.jpg", { type: "image/jpeg" });
    await expect(readCoverImage(file)).resolves.toBe("data:image/jpeg;base64,YWJj");
  });

  it("shrinks a downloaded cover, and leaves it alone where shrinking is unavailable", async () => {
    const downloaded = `data:image/jpeg;base64,${"A".repeat(10_000)}`;
    await expect(shrinkCoverDataUrl(downloaded)).resolves.toBe(downloaded);

    stubImagePipeline({ width: 1200, height: 1800 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ blob: async () => new Blob(["cover"]) }));
    await expect(shrinkCoverDataUrl(downloaded)).resolves.toBe(SHRUNK);
  });
});
