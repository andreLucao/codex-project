-- CreateEnum
CREATE TYPE "SentMessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "sent_messages" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "whatsapp_message_id" VARCHAR(255),
    "type" VARCHAR(50) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SentMessageStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "received_messages" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "sent_message_id" UUID NOT NULL,
    "whatsapp_message_id" VARCHAR(255) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "received_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sent_messages_whatsapp_message_id_key" ON "sent_messages"("whatsapp_message_id");

-- CreateIndex
CREATE INDEX "sent_messages_contact_id_created_at_idx" ON "sent_messages"("contact_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "received_messages_whatsapp_message_id_key" ON "received_messages"("whatsapp_message_id");

-- CreateIndex
CREATE INDEX "received_messages_contact_id_received_at_idx" ON "received_messages"("contact_id", "received_at");

-- CreateIndex
CREATE INDEX "received_messages_sent_message_id_idx" ON "received_messages"("sent_message_id");

-- AddForeignKey
ALTER TABLE "sent_messages" ADD CONSTRAINT "sent_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "received_messages" ADD CONSTRAINT "received_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "received_messages" ADD CONSTRAINT "received_messages_sent_message_id_fkey" FOREIGN KEY ("sent_message_id") REFERENCES "sent_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
