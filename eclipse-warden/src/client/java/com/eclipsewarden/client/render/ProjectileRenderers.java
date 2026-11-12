package com.eclipsewarden.client.render;

import com.eclipsewarden.EclipseWarden;
import com.eclipsewarden.entity.EclipseSlashEntity;
import com.eclipsewarden.entity.UmbralBoltEntity;
import net.minecraft.client.render.LightmapTextureManager;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.Entity;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.RotationAxis;
import net.minecraft.util.math.Vec3d;

/** Flat, full-bright quads for the two projectiles. */
public final class ProjectileRenderers {
	private ProjectileRenderers() {
	}

	private static void vertex(VertexConsumer buffer, MatrixStack.Entry entry, float x, float y, float z, float u, float v, int alpha) {
		buffer.vertex(entry, x, y, z).color(255, 255, 255, alpha).texture(u, v).overlay(OverlayTexture.DEFAULT_UV)
				.light(LightmapTextureManager.MAX_LIGHT_COORDINATE).normal(entry, 0, 1, 0);
	}

	/** A camera-facing pulsing orb. */
	public static class Bolt extends EntityRenderer<UmbralBoltEntity> {
		private static final Identifier TEXTURE = EclipseWarden.id("textures/entity/umbral_bolt.png");
		private static final RenderLayer LAYER = RenderLayer.getEntityTranslucentEmissive(TEXTURE);

		public Bolt(EntityRendererFactory.Context context) {
			super(context);
		}

		@Override
		public void render(UmbralBoltEntity entity, float yaw, float tickDelta, MatrixStack matrices, VertexConsumerProvider vertexConsumers, int light) {
			matrices.push();
			matrices.translate(0, 0.25, 0);
			float size = 0.75f + 0.12f * MathHelper.sin((entity.age + tickDelta) * 0.7f);
			matrices.multiply(this.dispatcher.getRotation());
			matrices.multiply(RotationAxis.POSITIVE_Z.rotationDegrees((entity.age + tickDelta) * 14));
			MatrixStack.Entry entry = matrices.peek();
			VertexConsumer buffer = vertexConsumers.getBuffer(LAYER);
			vertex(buffer, entry, -size, -size, 0, 0, 1, 255);
			vertex(buffer, entry, size, -size, 0, 1, 1, 255);
			vertex(buffer, entry, size, size, 0, 1, 0, 255);
			vertex(buffer, entry, -size, size, 0, 0, 0, 255);
			matrices.pop();
			super.render(entity, yaw, tickDelta, matrices, vertexConsumers, light);
		}

		@Override
		public Identifier getTexture(UmbralBoltEntity entity) {
			return TEXTURE;
		}
	}

	/** A crescent lying across the direction of travel, fading as it runs out of life. */
	public static class Slash extends EntityRenderer<EclipseSlashEntity> {
		private static final Identifier TEXTURE = EclipseWarden.id("textures/entity/eclipse_slash.png");
		private static final RenderLayer LAYER = RenderLayer.getEntityTranslucentEmissive(TEXTURE);

		public Slash(EntityRendererFactory.Context context) {
			super(context);
		}

		@Override
		public void render(EclipseSlashEntity entity, float yaw, float tickDelta, MatrixStack matrices, VertexConsumerProvider vertexConsumers, int light) {
			Vec3d velocity = entity.getVelocity();
			if (velocity.lengthSquared() < 1.0E-6) {
				return;
			}
			float life = (entity.getLife() + tickDelta) / EclipseSlashEntity.MAX_LIFE;
			int alpha = (int) (255 * MathHelper.clamp(1.6f - life * 1.6f, 0.0f, 1.0f));
			float width = 1.9f + life * 0.9f;
			float depth = 0.95f;
			matrices.push();
			matrices.translate(0, 0.2, 0);
			matrices.multiply(RotationAxis.POSITIVE_Y.rotation((float) Math.atan2(velocity.x, velocity.z)));
			matrices.multiply(RotationAxis.POSITIVE_X.rotation((float) -Math.atan2(velocity.y, velocity.horizontalLength())));
			matrices.multiply(RotationAxis.POSITIVE_Z.rotationDegrees(12));
			MatrixStack.Entry entry = matrices.peek();
			VertexConsumer buffer = vertexConsumers.getBuffer(LAYER);
			vertex(buffer, entry, -width, 0, -depth, 0, 1, alpha);
			vertex(buffer, entry, width, 0, -depth, 1, 1, alpha);
			vertex(buffer, entry, width, 0, depth, 1, 0, alpha);
			vertex(buffer, entry, -width, 0, depth, 0, 0, alpha);
			matrices.pop();
			super.render(entity, yaw, tickDelta, matrices, vertexConsumers, light);
		}

		@Override
		public Identifier getTexture(EclipseSlashEntity entity) {
			return TEXTURE;
		}
	}

	static Identifier textureOf(Entity entity) {
		return entity instanceof UmbralBoltEntity ? Bolt.TEXTURE : Slash.TEXTURE;
	}
}
