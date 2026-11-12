package com.eclipsewarden.registry;

import com.eclipsewarden.EclipseWarden;
import com.eclipsewarden.entity.EclipseSlashEntity;
import com.eclipsewarden.entity.EclipseWardenEntity;
import com.eclipsewarden.entity.UmbralBoltEntity;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnGroup;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;

public final class ModEntities {
	public static final EntityType<EclipseWardenEntity> ECLIPSE_WARDEN = register("eclipse_warden",
			EntityType.Builder.create(EclipseWardenEntity::new, SpawnGroup.MONSTER).dimensions(1.2f, 3.5f).eyeHeight(3.0f)
					.maxTrackingRange(10).makeFireImmune());
	public static final EntityType<UmbralBoltEntity> UMBRAL_BOLT = register("umbral_bolt",
			EntityType.Builder.<UmbralBoltEntity>create(UmbralBoltEntity::new, SpawnGroup.MISC).dimensions(0.5f, 0.5f)
					.maxTrackingRange(8).trackingTickInterval(2));
	public static final EntityType<EclipseSlashEntity> ECLIPSE_SLASH = register("eclipse_slash",
			EntityType.Builder.<EclipseSlashEntity>create(EclipseSlashEntity::new, SpawnGroup.MISC).dimensions(1.0f, 0.4f)
					.maxTrackingRange(8).trackingTickInterval(2));

	private ModEntities() {
	}

	private static <T extends Entity> EntityType<T> register(String name, EntityType.Builder<T> builder) {
		return Registry.register(Registries.ENTITY_TYPE, EclipseWarden.id(name), builder.build(name));
	}

	public static void init() {
		FabricDefaultAttributeRegistry.register(ECLIPSE_WARDEN, EclipseWardenEntity.createAttributes());
	}
}
