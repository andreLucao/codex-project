-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "responsible_name" VARCHAR(120) NOT NULL,
    "restaurant_name" VARCHAR(120) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "frequent_supplies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_responsible_name_not_blank" CHECK (char_length(trim("responsible_name")) > 0),
    CONSTRAINT "users_restaurant_name_not_blank" CHECK (char_length(trim("restaurant_name")) > 0),
    CONSTRAINT "users_address_not_blank" CHECK (char_length(trim("address")) > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "users_contact_id_key" ON "users"("contact_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
