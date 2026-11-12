package com.eclipsewarden.client.render;

import com.eclipsewarden.EclipseWarden;
import com.eclipsewarden.entity.EclipseWardenEntity;
import com.mojang.blaze3d.platform.GlStateManager;
import com.mojang.blaze3d.systems.RenderSystem;
import java.util.Random;
import net.fabricmc.fabric.api.client.rendering.v1.DimensionRenderingRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.minecraft.client.render.BufferBuilder;
import net.minecraft.client.render.BufferRenderer;
import net.minecraft.client.render.DimensionEffects;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.client.render.Tessellator;
import net.minecraft.client.render.VertexFormat;
import net.minecraft.client.render.VertexFormats;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.Entity;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.RotationAxis;
import net.minecraft.util.math.Vec3d;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * Sky of the Eclipsed Court: a dusk gradient over the void, slowly wheeling stars and a total
 * eclipse hanging to the north. The corona swells and reddens with the Warden's phase.
 */
public final class CourtSky implements DimensionRenderingRegistry.SkyRenderer {
	private static final Identifier CORONA = EclipseWarden.id("textures/environment/eclipse_corona.png");
	private static final Vector3f SUN_DIR = new Vector3f(0.0f, 0.5f, -0.866f);
	private static final float DOME = 100.0f;
	private static final int STAR_COUNT = 700;
	private final float[] stars = new float[STAR_COUNT * 5];
	private float shownPhase = 1.0f;

	public CourtSky() {
		Random random = new Random(1021L);
		for (int i = 0; i < STAR_COUNT; i++) {
			double y = random.nextDouble() * 2 - 1;
			double angle = random.nextDouble() * Math.PI * 2;
			double flat = Math.sqrt(1 - y * y);
			this.stars[i * 5] = (float) (Math.cos(angle) * flat);
			this.stars[i * 5 + 1] = (float) y;
			this.stars[i * 5 + 2] = (float) (Math.sin(angle) * flat);
			this.stars[i * 5 + 3] = 0.12f + random.nextFloat() * 0.22f;
			this.stars[i * 5 + 4] = 0.35f + random.nextFloat() * 0.65f;
		}
	}

	/** No clouds, no sunrise tint, and fog straight from the biome. */
	public static final class Effects extends DimensionEffects {
		public Effects() {
			super(Float.NaN, false, SkyType.NORMAL, false, false);
		}

		@Override
		public Vec3d adjustFogColor(Vec3d color, float sunHeight) {
			return color;
		}

		@Override
		public boolean useThickFog(int camX, int camY) {
			return false;
		}

		@Override
		public float[] getFogColorOverride(float skyAngle, float tickDelta) {
			return null;
		}
	}

	@Override
	public void render(WorldRenderContext context) {
		float time = context.world().getTime() + context.tickCounter().getTickDelta(false);
		int phase = 1;
		for (Entity entity : context.world().getEntities()) {
			if (entity instanceof EclipseWardenEntity warden && warden.isAlive()) {
				phase = Math.max(phase, warden.getPhase());
			}
		}
		this.shownPhase += (phase - this.shownPhase) * 0.02f;
		float fury = (this.shownPhase - 1.0f) / 2.0f;

		MatrixStack matrices = new MatrixStack();
		matrices.multiplyPositionMatrix(context.positionMatrix());
		RenderSystem.depthMask(false);
		RenderSystem.disableCull();
		RenderSystem.enableBlend();
		RenderSystem.defaultBlendFunc();
		RenderSystem.setShaderColor(1, 1, 1, 1);

		drawDome(matrices.peek().getPositionMatrix(), fury);

		RenderSystem.blendFunc(GlStateManager.SrcFactor.SRC_ALPHA, GlStateManager.DstFactor.ONE);
		matrices.push();
		matrices.multiply(RotationAxis.POSITIVE_X.rotationDegrees(20));
		matrices.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(time * 0.004f));
		drawStars(matrices.peek().getPositionMatrix(), time, 1.0f - fury * 0.5f);
		matrices.pop();

		Matrix4f matrix = matrices.peek().getPositionMatrix();
		float pulse = 1.0f + 0.03f * MathHelper.sin(time * 0.05f);
		float red = 1.0f;
		float green = 1.0f - 0.55f * fury;
		float blue = 1.0f - 0.7f * fury;
		drawCorona(matrix, (62 + 18 * fury) * pulse, time * 0.0015f, red, green, blue, 1.0f);
		drawCorona(matrix, (84 + 26 * fury) * pulse, -time * 0.0011f, red, green, blue, 0.45f + 0.25f * fury);

		RenderSystem.defaultBlendFunc();
		drawMoon(matrix, 62 * 0.22f * 0.98f);

		RenderSystem.enableCull();
		RenderSystem.depthMask(true);
		RenderSystem.disableBlend();
	}

	private void drawDome(Matrix4f matrix, float fury) {
		int zenith = color(0.02f + 0.03f * fury, 0.01f, 0.05f, 1);
		int horizon = color(0.20f + 0.25f * fury, 0.07f, 0.26f - 0.10f * fury, 1);
		int abyss = color(0.01f, 0.0f, 0.03f, 1);
		RenderSystem.setShader(GameRenderer::getPositionColorProgram);
		for (int half = 0; half < 2; half++) {
			BufferBuilder buffer = Tessellator.getInstance().begin(VertexFormat.DrawMode.TRIANGLE_FAN, VertexFormats.POSITION_COLOR);
			buffer.vertex(matrix, 0, half == 0 ? DOME : -DOME, 0).color(half == 0 ? zenith : abyss);
			for (int i = 0; i <= 24; i++) {
				float angle = i * MathHelper.TAU / 24;
				buffer.vertex(matrix, MathHelper.cos(angle) * DOME, -6.0f, MathHelper.sin(angle) * DOME).color(horizon);
			}
			BufferRenderer.drawWithGlobalProgram(buffer.end());
		}
	}

	private void drawStars(Matrix4f matrix, float time, float brightness) {
		RenderSystem.setShader(GameRenderer::getPositionColorProgram);
		BufferBuilder buffer = Tessellator.getInstance().begin(VertexFormat.DrawMode.QUADS, VertexFormats.POSITION_COLOR);
		for (int i = 0; i < STAR_COUNT; i++) {
			Vector3f dir = new Vector3f(this.stars[i * 5], this.stars[i * 5 + 1], this.stars[i * 5 + 2]);
			float twinkle = 0.75f + 0.25f * MathHelper.sin(time * 0.08f + i * 1.7f);
			int tint = color(0.85f + 0.15f * (i % 3 == 0 ? 1 : 0), 0.82f, 1.0f, this.stars[i * 5 + 4] * twinkle * brightness);
			quad(buffer, matrix, dir, this.stars[i * 5 + 3], 0, (x, y, z, u, v) -> buffer.vertex(matrix, x, y, z).color(tint));
		}
		BufferRenderer.drawWithGlobalProgram(buffer.end());
	}

	private void drawCorona(Matrix4f matrix, float size, float roll, float red, float green, float blue, float alpha) {
		RenderSystem.setShader(GameRenderer::getPositionTexColorProgram);
		RenderSystem.setShaderTexture(0, CORONA);
		BufferBuilder buffer = Tessellator.getInstance().begin(VertexFormat.DrawMode.QUADS, VertexFormats.POSITION_TEXTURE_COLOR);
		int tint = color(red, green, blue, alpha);
		quad(buffer, matrix, SUN_DIR, size, roll, (x, y, z, u, v) -> buffer.vertex(matrix, x, y, z).texture(u, v).color(tint));
		BufferRenderer.drawWithGlobalProgram(buffer.end());
	}

	private void drawMoon(Matrix4f matrix, float radius) {
		Vector3f forward = new Vector3f(SUN_DIR).normalize();
		Vector3f right = new Vector3f(forward).cross(0, 1, 0).normalize();
		Vector3f up = new Vector3f(right).cross(forward);
		RenderSystem.setShader(GameRenderer::getPositionColorProgram);
		BufferBuilder buffer = Tessellator.getInstance().begin(VertexFormat.DrawMode.TRIANGLE_FAN, VertexFormats.POSITION_COLOR);
		int black = color(0.01f, 0.0f, 0.02f, 1);
		buffer.vertex(matrix, forward.x * DOME, forward.y * DOME, forward.z * DOME).color(black);
		for (int i = 0; i <= 40; i++) {
			float angle = i * MathHelper.TAU / 40;
			float c = MathHelper.cos(angle) * radius;
			float s = MathHelper.sin(angle) * radius;
			buffer.vertex(matrix, forward.x * DOME + right.x * c + up.x * s, forward.y * DOME + right.y * c + up.y * s,
					forward.z * DOME + right.z * c + up.z * s).color(black);
		}
		BufferRenderer.drawWithGlobalProgram(buffer.end());
	}

	@FunctionalInterface
	private interface Corner {
		void emit(float x, float y, float z, float u, float v);
	}

	/** Emits a square of the given half-size facing the origin, centred on the dome along dir. */
	private static void quad(BufferBuilder buffer, Matrix4f matrix, Vector3f dir, float halfSize, float roll, Corner corner) {
		Vector3f forward = new Vector3f(dir).normalize();
		Vector3f right = Math.abs(forward.y) > 0.99f ? new Vector3f(1, 0, 0) : new Vector3f(forward).cross(0, 1, 0).normalize();
		Vector3f up = new Vector3f(right).cross(forward);
		float cos = MathHelper.cos(roll);
		float sin = MathHelper.sin(roll);
		float[][] corners = {{-1, -1, 0, 1}, {1, -1, 1, 1}, {1, 1, 1, 0}, {-1, 1, 0, 0}};
		for (float[] c : corners) {
			float a = (c[0] * cos - c[1] * sin) * halfSize;
			float b = (c[0] * sin + c[1] * cos) * halfSize;
			corner.emit(forward.x * DOME + right.x * a + up.x * b, forward.y * DOME + right.y * a + up.y * b,
					forward.z * DOME + right.z * a + up.z * b, c[2], c[3]);
		}
	}

	private static int color(float red, float green, float blue, float alpha) {
		return ((int) (MathHelper.clamp(alpha, 0, 1) * 255) << 24) | ((int) (MathHelper.clamp(red, 0, 1) * 255) << 16)
				| ((int) (MathHelper.clamp(green, 0, 1) * 255) << 8) | (int) (MathHelper.clamp(blue, 0, 1) * 255);
	}
}
