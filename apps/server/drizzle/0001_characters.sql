CREATE TYPE "public"."character_status" AS ENUM('draft', 'ready');--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('weapon', 'armor', 'gear', 'tool', 'magic-item', 'custom');--> statement-breakpoint
CREATE TABLE "character_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"kind" "item_kind" NOT NULL,
	"item_id" text,
	"name" text,
	"variant" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"equipped" boolean DEFAULT false NOT NULL,
	"attuned" boolean DEFAULT false NOT NULL,
	"charges_used" smallint DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_items_has_identity" CHECK (("character_items"."kind" = 'custom' AND "character_items"."name" IS NOT NULL) OR ("character_items"."kind" <> 'custom' AND "character_items"."item_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "character_levels" (
	"character_id" uuid NOT NULL,
	"level" smallint NOT NULL,
	"class_id" text NOT NULL,
	"subclass_id" text,
	"hp_roll" smallint,
	CONSTRAINT "character_levels_character_id_level_pk" PRIMARY KEY("character_id","level"),
	CONSTRAINT "character_levels_level_range" CHECK ("character_levels"."level" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "character_spells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"spell_id" text NOT NULL,
	"source" text NOT NULL,
	"prepared" boolean DEFAULT false NOT NULL,
	"always_prepared" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_state" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"hp_current" integer NOT NULL,
	"hp_temp" integer DEFAULT 0 NOT NULL,
	"hit_dice_spent" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"death_save_success" smallint DEFAULT 0 NOT NULL,
	"death_save_fail" smallint DEFAULT 0 NOT NULL,
	"exhaustion" smallint DEFAULT 0 NOT NULL,
	"heroic_inspiration" boolean DEFAULT false NOT NULL,
	"spell_slots_used" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pact_slots_used" smallint DEFAULT 0 NOT NULL,
	"feature_uses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conditions" text[] DEFAULT '{}' NOT NULL,
	"concentrating_on" text,
	"coins" jsonb DEFAULT '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"campaign_id" uuid,
	"status" character_status DEFAULT 'draft' NOT NULL,
	"builder_step" smallint DEFAULT 0 NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"species_id" text,
	"background_id" text,
	"alignment" text,
	"xp" integer DEFAULT 0 NOT NULL,
	"str" smallint,
	"dex" smallint,
	"con" smallint,
	"int" smallint,
	"wis" smallint,
	"cha" smallint,
	"background_bonus" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"build" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_items" ADD CONSTRAINT "character_items_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_levels" ADD CONSTRAINT "character_levels_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_spells" ADD CONSTRAINT "character_spells_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_state" ADD CONSTRAINT "character_state_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_items_character_idx" ON "character_items" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "character_spells_unique_idx" ON "character_spells" USING btree ("character_id","spell_id","source");--> statement-breakpoint
CREATE INDEX "characters_owner_idx" ON "characters" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "characters_campaign_idx" ON "characters" USING btree ("campaign_id");