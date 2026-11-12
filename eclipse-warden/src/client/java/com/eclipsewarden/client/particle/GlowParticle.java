package com.eclipsewarden.client.particle;

import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleFactory;
import net.minecraft.client.particle.ParticleTextureSheet;
import net.minecraft.client.particle.SpriteBillboardParticle;
import net.minecraft.client.particle.SpriteProvider;
import net.minecraft.client.render.LightmapTextureManager;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.particle.SimpleParticleType;

/** Full-bright particle that plays its sprite strip once while shrinking and fading. */
public class GlowParticle extends SpriteBillboardParticle {
	private final SpriteProvider sprites;
	private final float startScale;

	private GlowParticle(ClientWorld world, double x, double y, double z, double vx, double vy, double vz, SpriteProvider sprites,
			float scale, int maxAge, float drag, float lift) {
		super(world, x, y, z);
		this.sprites = sprites;
		this.velocityX = vx;
		this.velocityY = vy;
		this.velocityZ = vz;
		this.velocityMultiplier = drag;
		this.gravityStrength = -lift;
		this.maxAge = maxAge;
		this.startScale = scale;
		this.scale = scale;
		this.collidesWithWorld = false;
		setSpriteForAge(sprites);
	}

	@Override
	public void tick() {
		super.tick();
		float life = this.age / (float) this.maxAge;
		this.scale = this.startScale * (1.0f - life * 0.6f);
		this.alpha = 1.0f - life * life;
		setSpriteForAge(this.sprites);
	}

	@Override
	protected int getBrightness(float tint) {
		return LightmapTextureManager.MAX_LIGHT_COORDINATE;
	}

	@Override
	public ParticleTextureSheet getType() {
		return ParticleTextureSheet.PARTICLE_SHEET_TRANSLUCENT;
	}

	/** Quick golden glint. */
	public record Spark(SpriteProvider sprites) implements ParticleFactory<SimpleParticleType> {
		@Override
		public Particle createParticle(SimpleParticleType type, ClientWorld world, double x, double y, double z, double vx, double vy, double vz) {
			return new GlowParticle(world, x, y, z, vx, vy, vz, this.sprites, 0.16f + world.random.nextFloat() * 0.1f,
					12 + world.random.nextInt(10), 0.9f, 0.0f);
		}
	}

	/** Slow violet mote that drifts upward. */
	public record Wisp(SpriteProvider sprites) implements ParticleFactory<SimpleParticleType> {
		@Override
		public Particle createParticle(SimpleParticleType type, ClientWorld world, double x, double y, double z, double vx, double vy, double vz) {
			return new GlowParticle(world, x, y, z, vx, vy, vz, this.sprites, 0.14f + world.random.nextFloat() * 0.12f,
					30 + world.random.nextInt(25), 0.94f, 0.03f);
		}
	}
}
