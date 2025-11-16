import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const app = Fastify({ logger: true });
const port = Number(process.env.PORT || 3009);

// Регистрируем multipart для загрузки файлов
app.register(multipart as any, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Простое хранилище изображений в памяти (в продакшене использовать S3 или файловую систему)
const imagesDir = path.join(process.cwd(), "images-storage");
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

const imageMetadata = new Map<
  string,
  {
    id: string;
    filename: string;
    size: number;
    uploadedAt: number;
    contentType: string;
  }
>();

app.get("/health", async () => ({ status: "ok", service: "images" }));

// Загрузка изображения
app.post("/images/upload", async (req, reply) => {
  try {
    const data = await (req as any).file();
    if (!data) {
      return reply.code(400).send({ error: "No file provided" });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply
        .code(400)
        .send({ error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP" });
    }

    const imageId = randomUUID();
    const extension = path.extname(data.filename || "image.jpg");
    const filename = `${imageId}${extension}`;
    const filepath = path.join(imagesDir, filename);

    // Сохраняем файл
    const buffer = await data.toBuffer();
    fs.writeFileSync(filepath, buffer);

    // Сохраняем метаданные
    imageMetadata.set(imageId, {
      id: imageId,
      filename: data.filename || "image",
      size: buffer.length,
      uploadedAt: Date.now(),
      contentType: data.mimetype,
    });

    return reply.code(201).send({
      id: imageId,
      filename: data.filename,
      size: buffer.length,
      contentType: data.mimetype,
      url: `/images/${imageId}`,
    });
  } catch (err: any) {
    app.log.error({ err }, "Upload error");
    return reply
      .code(500)
      .send({ error: "Upload failed", message: err?.message });
  }
});

// Получение изображения по ID
app.get("/images/:id", async (req, reply) => {
  const id = (req.params as any).id as string;
  const metadata = imageMetadata.get(id);
  if (!metadata) {
    return reply.code(404).send({ error: "Image not found" });
  }

  const filepath = path.join(
    imagesDir,
    `${id}${path.extname(metadata.filename)}`
  );
  if (!fs.existsSync(filepath)) {
    return reply.code(404).send({ error: "Image file not found" });
  }

  const fileBuffer = fs.readFileSync(filepath);
  return reply.type(metadata.contentType).send(fileBuffer);
});

// Получение списка всех изображений
app.get("/images", async (req, reply) => {
  const images = Array.from(imageMetadata.values()).map((img) => ({
    id: img.id,
    filename: img.filename,
    size: img.size,
    uploadedAt: img.uploadedAt,
    url: `/images/${img.id}`,
  }));
  return images;
});

// Удаление изображения
app.delete("/images/:id", async (req, reply) => {
  const id = (req.params as any).id as string;
  const metadata = imageMetadata.get(id);
  if (!metadata) {
    return reply.code(404).send({ error: "Image not found" });
  }

  const filepath = path.join(
    imagesDir,
    `${id}${path.extname(metadata.filename)}`
  );
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }

  imageMetadata.delete(id);
  return { deleted: true, id };
});

async function start() {
  try {
    const address = await app.listen({ port, host: "0.0.0.0" });
    app.log.info({ address }, "listening");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
