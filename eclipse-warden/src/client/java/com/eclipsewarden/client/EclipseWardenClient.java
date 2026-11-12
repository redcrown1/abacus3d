package com.eclipsewarden.client;

import com.eclipsewarden.EclipseWarden;
import com.eclipsewarden.client.model.EclipseWardenModel;
import com.eclipsewarden.client.model.WardenModelData;
import com.eclipsewarden.client.particle.GlowParticle;
import com.eclipsewarden.client.render.CourtSky;
import com.eclipsewarden.client.render.EclipseWardenRenderer;
import com.eclipsewarden.client.render.ProjectileRenderers;
import com.eclipsewarden.registry.ModEntities;
import com.eclipsewarden.registry.ModParticles;
import com.eclipsewarden.world.EclipsedCourt;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.DimensionRenderingRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;

public class EclipseWardenClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		EntityModelLayerRegistry.registerModelLayer(EclipseWardenModel.LAYER, WardenModelData::create);
		EntityRendererRegistry.register(ModEntities.ECLIPSE_WARDEN, EclipseWardenRenderer::new);
		EntityRendererRegistry.register(ModEntities.UMBRAL_BOLT, ProjectileRenderers.Bolt::new);
		EntityRendererRegistry.register(ModEntities.ECLIPSE_SLASH, ProjectileRenderers.Slash::new);

		ParticleFactoryRegistry.getInstance().register(ModParticles.ECLIPSE_SPARK, GlowParticle.Spark::new);
		ParticleFactoryRegistry.getInstance().register(ModParticles.UMBRAL_WISP, GlowParticle.Wisp::new);

		DimensionRenderingRegistry.registerDimensionEffects(EclipseWarden.id("eclipsed_court"), new CourtSky.Effects());
		DimensionRenderingRegistry.registerSkyRenderer(EclipsedCourt.WORLD_KEY, new CourtSky());
	}
}
