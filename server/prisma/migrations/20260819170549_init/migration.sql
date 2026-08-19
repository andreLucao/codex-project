-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "phone_number" VARCHAR(15) NOT NULL,
    "name" VARCHAR(120),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contacts_phone_number_key" ON "contacts"("phone_number");
