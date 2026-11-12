package com.eclipsewarden.client.render;

import com.eclipsewarden.EclipseWarden;
import com.eclipsewarden.client.model.EclipseWardenModel;
import com.eclipsewarden.entity.EclipseWardenEntity;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.MobEntityRenderer;
import net.minecraft.client.render.entity.feature.EyesFeatureRenderer;
import net.minecraft.client.render.entity.feature.FeatureRendererContext;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;

public class EclipseWardenRenderer extends MobEntityRenderer<EclipseWardenEntity, EclipseWardenModel> {
	private static final Identifier TEXTURE = EclipseWarden.id("textures/entity/eclipse_warden.png");
	private static final RenderLayer GLOW = RenderLayer.getEyes(EclipseWarden.id("textures/entity/eclipse_warden_glow.png"));

	public EclipseWardenRenderer(EntityRendererFactory.Context context) {
		super(context, new EclipseWardenModel(context.getPart(EclipseWardenModel.LAYER)), 0.9f);
		addFeature(new GlowFeature(this));
	}

	@Override
	public Identifier getTexture(EclipseWardenEntity entity) {
		return TEXTURE;
	}

	@Override
	protected int getBlockLight(EclipseWardenEntity entity, BlockPos pos) {
		// never fully swallowed by the dark it fights in
		return Math.max(super.getBlockLight(entity, pos), 9);
	}

	/** Additive pass for the eyes, runes, halo, wings and blade edge. */
	private static final class GlowFeature extends EyesFeatureRenderer<EclipseWardenEntity, EclipseWardenModel> {
		private GlowFeature(FeatureRendererContext<EclipseWardenEntity, EclipseWardenModel> context) {
			super(context);
		}

		@Override
		public RenderLayer getEyesTexture() {
			return GLOW;
		}
	}
}
