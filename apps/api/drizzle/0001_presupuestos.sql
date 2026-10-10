CREATE TYPE "public"."estado_presupuesto" AS ENUM('borrador', 'autorizado', 'congelado');--> statement-breakpoint
CREATE TYPE "public"."etapa_presupuesto" AS ENUM('inicial', 'planificado');--> statement-breakpoint
CREATE TYPE "public"."tipo_insumo" AS ENUM('material', 'mano_obra', 'herramienta', 'equipo', 'subcontrato', 'flete', 'otro');--> statement-breakpoint
CREATE TYPE "public"."tipo_matriz" AS ENUM('concepto', 'auxiliar', 'material', 'mano_obra', 'herramienta', 'equipo', 'subcontrato', 'flete', 'otro');--> statement-breakpoint
CREATE TYPE "public"."tipo_presupuesto" AS ENUM('venta', 'costo');--> statement-breakpoint
CREATE TYPE "public"."tipo_proyecto" AS ENUM('obra', 'centro_costos');--> statement-breakpoint
CREATE TYPE "public"."tipo_renglon" AS ENUM('partida', 'concepto');--> statement-breakpoint
CREATE TABLE "bitacora" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"usuario_id" uuid,
	"metodo" text NOT NULL,
	"ruta" text NOT NULL,
	"estado" integer NOT NULL,
	"datos" jsonb
);
--> statement-breakpoint
CREATE TABLE "cuantificaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"renglon_id" uuid NOT NULL,
	"orden" integer NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"eje" text DEFAULT '' NOT NULL,
	"piezas" numeric(20, 6),
	"largo" numeric(20, 6),
	"ancho" numeric(20, 6),
	"alto" numeric(20, 6),
	"formula" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insumos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presupuesto_id" uuid NOT NULL,
	"clave" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"unidad" text DEFAULT '' NOT NULL,
	"tipo" "tipo_insumo" NOT NULL,
	"costo" numeric(20, 6) DEFAULT '0' NOT NULL,
	"moneda" text DEFAULT 'MXN' NOT NULL,
	"porcentaje_mano_obra" boolean DEFAULT false NOT NULL,
	"salario_base" numeric(20, 6),
	"fsr" numeric(12, 6)
);
--> statement-breakpoint
CREATE TABLE "matrices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presupuesto_id" uuid NOT NULL,
	"clave" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"unidad" text DEFAULT '' NOT NULL,
	"tipo" "tipo_matriz" DEFAULT 'concepto' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matriz_renglones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matriz_id" uuid NOT NULL,
	"orden" integer NOT NULL,
	"componente" text NOT NULL,
	"cantidad" numeric(20, 8) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presupuesto_renglones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presupuesto_id" uuid NOT NULL,
	"padre_id" uuid,
	"orden" integer NOT NULL,
	"tipo" "tipo_renglon" NOT NULL,
	"clave" text DEFAULT '' NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"unidad" text DEFAULT '' NOT NULL,
	"matriz_id" uuid,
	"cantidad" numeric(20, 6)
);
--> statement-breakpoint
CREATE TABLE "presupuestos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_presupuesto" DEFAULT 'venta' NOT NULL,
	"etapa" "etapa_presupuesto" DEFAULT 'inicial' NOT NULL,
	"estado" "estado_presupuesto" DEFAULT 'borrador' NOT NULL,
	"moneda_base" text DEFAULT 'MXN' NOT NULL,
	"origen" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proyectos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_proyecto" DEFAULT 'obra' NOT NULL,
	"cliente" text,
	"ubicacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bitacora" ADD CONSTRAINT "bitacora_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuantificaciones" ADD CONSTRAINT "cuantificaciones_renglon_id_presupuesto_renglones_id_fk" FOREIGN KEY ("renglon_id") REFERENCES "public"."presupuesto_renglones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_presupuesto_id_presupuestos_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."presupuestos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrices" ADD CONSTRAINT "matrices_presupuesto_id_presupuestos_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."presupuestos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matriz_renglones" ADD CONSTRAINT "matriz_renglones_matriz_id_matrices_id_fk" FOREIGN KEY ("matriz_id") REFERENCES "public"."matrices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuesto_renglones" ADD CONSTRAINT "presupuesto_renglones_presupuesto_id_presupuestos_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."presupuestos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuesto_renglones" ADD CONSTRAINT "presupuesto_renglones_padre_id_presupuesto_renglones_id_fk" FOREIGN KEY ("padre_id") REFERENCES "public"."presupuesto_renglones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuesto_renglones" ADD CONSTRAINT "presupuesto_renglones_matriz_id_matrices_id_fk" FOREIGN KEY ("matriz_id") REFERENCES "public"."matrices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_proyecto_id_proyectos_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."proyectos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bitacora_fecha" ON "bitacora" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "cuantificaciones_renglon" ON "cuantificaciones" USING btree ("renglon_id","orden");--> statement-breakpoint
CREATE UNIQUE INDEX "insumos_clave_unica" ON "insumos" USING btree ("presupuesto_id","clave");--> statement-breakpoint
CREATE UNIQUE INDEX "matrices_clave_unica" ON "matrices" USING btree ("presupuesto_id","clave");--> statement-breakpoint
CREATE INDEX "matriz_renglones_matriz" ON "matriz_renglones" USING btree ("matriz_id","orden");--> statement-breakpoint
CREATE INDEX "presupuesto_renglones_arbol" ON "presupuesto_renglones" USING btree ("presupuesto_id","padre_id","orden");--> statement-breakpoint
CREATE UNIQUE INDEX "proyectos_nombre_unico" ON "proyectos" USING btree (lower("nombre"));