package com.eclipsewarden.registry;

import com.eclipsewarden.EclipseWarden;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.particle.SimpleParticleType;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;

public final class ModParticles {
	public static final SimpleParticleType ECLIPSE_SPARK = FabricParticleTypes.simple(true);
	public static final SimpleParticleType UMBRAL_WISP = FabricParticleTypes.simple(true);

	private ModParticles() {
	}

	public static void init() {
		Registry.register(Registries.PARTICLE_TYPE, EclipseWarden.id("eclipse_spark"), ECLIPSE_SPARK);
		Registry.register(Registries.PARTICLE_TYPE, EclipseWarden.id("umbral_wisp"), UMBRAL_WISP);
	}
}
