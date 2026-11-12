package com.eclipsewarden.client.model;

import net.minecraft.client.render.entity.animation.Animation;
import net.minecraft.client.render.entity.animation.AnimationHelper;
import net.minecraft.client.render.entity.animation.Keyframe;
import net.minecraft.client.render.entity.animation.Transformation;

/**
 * Keyframe animations for the Warden. Rotations are in degrees and are added on top of the rest
 * pose from WardenModelData; lengths match the attack timings in EclipseWardenEntity (20 ticks = 1s).
 */
public final class WardenAnimations {
	private static final String WING_RU = "wing_right_upper";
	private static final String WING_RL = "wing_right_lower";
	private static final String WING_LU = "wing_left_upper";
	private static final String WING_LL = "wing_left_lower";

	public static final Animation IDLE = Animation.Builder.create(8.0f).looping()
			.addBoneAnimation("waist", move(k(0, 0, 0, 0), k(2, 0, 1.5f, 0), k(4, 0, 0, 0), k(6, 0, 1.5f, 0), k(8, 0, 0, 0)))
			.addBoneAnimation("halo", spin(l(0, 0, 0, 0), l(4, 0, 0, 180), l(8, 0, 0, 360)))
			.addBoneAnimation("cape", rot(k(0, 0, 0, 0), k(4, 7, 0, 0), k(8, 0, 0, 0)))
			.addBoneAnimation("robe_mid", rot(k(0, 3, 0, 0), k(4, -2, 0, 2), k(8, 3, 0, 0)))
			.addBoneAnimation("robe_low", rot(k(0, 5, 0, 0), k(4, -4, 0, -3), k(8, 5, 0, 0)))
			.addBoneAnimation(WING_RU, rot(k(0, 0, 0, 0), k(2, 0, 4, 9), k(4, 0, 0, 0), k(6, 0, 4, 9), k(8, 0, 0, 0)))
			.addBoneAnimation(WING_LU, rot(k(0, 0, 0, 0), k(2, 0, -4, -9), k(4, 0, 0, 0), k(6, 0, -4, -9), k(8, 0, 0, 0)))
			.addBoneAnimation(WING_RL, rot(k(0, 0, 0, 0), k(2.5f, 0, 3, -7), k(4.5f, 0, 0, 0), k(6.5f, 0, 3, -7), k(8, 0, 0, 0)))
			.addBoneAnimation(WING_LL, rot(k(0, 0, 0, 0), k(2.5f, 0, -3, 7), k(4.5f, 0, 0, 0), k(6.5f, 0, -3, 7), k(8, 0, 0, 0)))
			.addBoneAnimation("right_arm", rot(k(0, 0, 0, 0), k(4, -3, 0, 2), k(8, 0, 0, 0)))
			.addBoneAnimation("left_arm", rot(k(0, 0, 0, 0), k(4, -4, 0, -3), k(8, 0, 0, 0)))
			.addBoneAnimation("orb", move(k(0, 0, 0, 0), k(2, 0, 1.2f, 0), k(4, 0, 0, 0), k(6, 0, 1.2f, 0), k(8, 0, 0, 0)))
			.addBoneAnimation("orb", spin(l(0, 0, 0, 0), l(8, 0, 720, 0)))
			.build();

	public static final Animation SPAWN = Animation.Builder.create(3.0f)
			.addBoneAnimation("waist", move(l(0, 0, -58, 0), k(1.6f, 0, 3, 0), k(2.0f, 0, 0, 0), k(3, 0, 0, 0)))
			.addBoneAnimation("right_arm", rot(k(0, 0, 0, 0), k(1.9f, 0, 0, 0), k(2.2f, -20, 0, 70), k(2.7f, -20, 0, 70), k(3, 0, 0, 0)))
			.addBoneAnimation("left_arm", rot(k(0, 0, 0, 0), k(1.9f, 0, 0, 0), k(2.2f, -20, 0, -70), k(2.7f, -20, 0, -70), k(3, 0, 0, 0)))
			.addBoneAnimation("head", rot(k(0, 25, 0, 0), k(1.9f, 15, 0, 0), k(2.2f, -28, 0, 0), k(2.7f, -28, 0, 0), k(3, 0, 0, 0)))
			.addBoneAnimation("halo", grow(l(0, 0.1f), l(1.8f, 0.4f), l(2.2f, 1.7f), l(3, 1)))
			.addBoneAnimation(WING_RU, rot(k(0, 0, 0, -40), k(1.9f, 0, 0, -40), k(2.2f, 0, 0, 28), k(2.7f, 0, 0, 28), k(3, 0, 0, 0)))
			.addBoneAnimation(WING_LU, rot(k(0, 0, 0, 40), k(1.9f, 0, 0, 40), k(2.2f, 0, 0, -28), k(2.7f, 0, 0, -28), k(3, 0, 0, 0)))
			.addBoneAnimation(WING_RL, rot(k(0, 0, 0, -30), k(1.9f, 0, 0, -30), k(2.2f, 0, 0, -22), k(3, 0, 0, 0)))
			.addBoneAnimation(WING_LL, rot(k(0, 0, 0, 30), k(1.9f, 0, 0, 30), k(2.2f, 0, 0, 22), k(3, 0, 0, 0)))
			.build();

	/** Wind up to 0.45s, cut at 0.65s (tick 13), back-swing lands at 1.05s (tick 21, phases two and three). */
	public static final Animation SLASH = Animation.Builder.create(1.5f)
			.addBoneAnimation("torso", rot(k(0, 0, 0, 0), k(0.45f, 0, 45, 0), k(0.65f, 0, -50, 0), k(0.85f, 0, -50, 0), k(1.05f, 0, 40, 0), k(1.4f, 0, 0, 0)))
			.addBoneAnimation("right_arm", rot(k(0, 0, 0, 0), k(0.45f, -110, 30, 30), k(0.65f, -50, -35, 10), k(0.85f, -45, -40, 10),
					k(1.05f, -100, 30, 35), k(1.4f, 0, 0, 0)))
			.addBoneAnimation("right_forearm", rot(k(0, 0, 0, 0), k(0.45f, -20, 0, 0), k(0.65f, 28, 0, 0), k(0.85f, 28, 0, 0), k(1.05f, -10, 0, 0), k(1.4f, 0, 0, 0)))
			.addBoneAnimation("waist", rot(k(0, 0, 0, 0), k(0.45f, -8, 0, 0), k(0.65f, 14, 0, 0), k(1.05f, 6, 0, 0), k(1.4f, 0, 0, 0)))
			.addBoneAnimation("left_arm", rot(k(0, 0, 0, 0), k(0.45f, 20, 0, -25), k(0.65f, 35, 0, -15), k(1.4f, 0, 0, 0)))
			.addBoneAnimation(WING_RU, rot(k(0, 0, 0, 0), k(0.65f, 0, 0, 22), k(1.4f, 0, 0, 0)))
			.addBoneAnimation(WING_LU, rot(k(0, 0, 0, 0), k(0.65f, 0, 0, -22), k(1.4f, 0, 0, 0)))
			.addBoneAnimation("cape", rot(k(0, 0, 0, 0), k(0.65f, 30, 0, 0), k(1.4f, 0, 0, 0)))
			.build();

	public static final Animation CAST = Animation.Builder.create(2.8f)
			.addBoneAnimation("left_arm", rot(k(0, 0, 0, 0), k(0.5f, -92, -8, -6), k(2.3f, -92, -8, -6), k(2.8f, 0, 0, 0)))
			.addBoneAnimation("left_forearm", rot(k(0, 0, 0, 0), k(0.5f, 24, 0, 0), k(2.3f, 24, 0, 0), k(2.8f, 0, 0, 0)))
			.addBoneAnimation("torso", rot(k(0, 0, 0, 0), k(0.5f, 0, 20, 0), k(2.3f, 0, 20, 0), k(2.8f, 0, 0, 0)))
			.addBoneAnimation("right_arm", rot(k(0, 0, 0, 0), k(0.5f, 14, 0, 16), k(2.3f, 14, 0, 16), k(2.8f, 0, 0, 0)))
			.addBoneAnimation("orb", grow(l(0, 1), l(0.5f, 2.2f), l(0.8f, 1.6f), l(1.1f, 2.2f), l(1.4f, 1.6f), l(1.7f, 2.2f), l(2.0f, 1.6f), l(2.3f, 2.2f), l(2.8f, 1)))
			.build();

	public static final Animation RAISE = Animation.Builder.create(2.0f)
			.addBoneAnimation("right_arm", rot(k(0, 0, 0, 0), k(0.5f, -160, 0, 14), k(1.6f, -160, 0, 14), k(2, 0, 0, 0)))
			.addBoneAnimation("right_forearm", rot(k(0, 0, 0, 0), k(0.5f, 32, 0, 0), k(1.6f, 32, 0, 0), k(2, 0, 0, 0)))
			.addBoneAnimation("sword", rot(k(0, 0, 0, 0), k(0.5f, 80, 0, 0), k(1.6f, 80, 0, 0), k(2, 0, 0, 0)))
			.addBoneAnimation("left_arm", rot(k(0, 0, 0, 0), k(0.5f, -150, 0, -25), k(1.6f, -150, 0, -25), k(2, 0, 0, 0)))
			.addBoneAnimation("head", rot(k(0, 0, 0, 0), k(0.5f, -30, 0, 0), k(1.6f, -30, 0, 0), k(2, 0, 0, 0)))
			.addBoneAnimation("waist", move(k(0, 0, 0, 0), k(0.5f, 0, 4, 0), k(1.6f, 0, 4, 0), k(2, 0, 0, 0)))
			.addBoneAnimation("halo", grow(l(0, 1), l(0.5f, 1.5f), l(1.6f, 1.5f), l(2, 1)))
			.build();

	/** Sword overhead during the leap, driven down as the dive starts at 0.65s. */
	public static final Animation SLAM = Animation.Builder.create(2.0f)
			.addBoneAnimation("right_arm", rot(k(0, 0, 0, 0), k(0.5f, -165, 0, 8), k(0.7f, -165, 0, 8), k(0.9f, -48, -18, 0), k(1.6f, -48, -18, 0), k(2, 0, 0, 0)))
			.addBoneAnimation("right_forearm", rot(k(0, 0, 0, 0), k(0.5f, 32, 0, 0), k(0.7f, 32, 0, 0), k(0.9f, 20, 0, 0), k(1.6f, 20, 0, 0), k(2, 0, 0, 0)))
			.addBoneAnimation("sword", rot(k(0, 0, 0, 0), k(0.5f, 80, 0, 0), k(0.7f, 80, 0, 0), k(0.9f, 40, 0, 0), k(1.6f, 40, 0, 0), k(2, 0, 0, 0)))
			.addBoneAnimation("left_arm", rot(k(0, 0, 0, 0), k(0.5f, -160, 0, -12), k(0.7f, -160, 0, -12), k(0.9f, -48, 18, 0), k(1.6f, -48, 18, 0), k(2, 0, 0, 0)))
			.addBoneAnimation("waist", rot(k(0, 0, 0, 0), k(0.5f, -16, 0, 0), k(0.7f, -16, 0, 0), k(0.9f, 30, 0, 0), k(1.6f, 28, 0, 0), k(2, 0, 0, 0)))
			.addBoneAnimation("cape", rot(k(0, 0, 0, 0), k(0.5f, 20, 0, 0), k(0.9f, 60, 0, 0), k(1.6f, 10, 0, 0), k(2, 0, 0, 0)))
			.addBoneAnimation(WING_RU, rot(k(0, 0, 0, 0), k(0.5f, 0, 0, 30), k(0.9f, 0, 0, -20), k(2, 0, 0, 0)))
			.addBoneAnimation(WING_LU, rot(k(0, 0, 0, 0), k(0.5f, 0, 0, -30), k(0.9f, 0, 0, 20), k(2, 0, 0, 0)))
			.build();

	public static final Animation BLINK = Animation.Builder.create(0.5f)
			.addBoneAnimation("waist", grow(l(0, 1), l(0.3f, 0.02f), l(0.5f, 0.02f)))
			.build();

	/** Sword planted, then head back and wings wide while the rays sweep (charge ends at 2s). */
	public static final Animation RAYS = Animation.Builder.create(10.0f)
			.addBoneAnimation("right_arm", rot(k(0, 0, 0, 0), k(1.2f, -50, -25, 0), k(9.5f, -50, -25, 0), k(10, 0, 0, 0)))
			.addBoneAnimation("right_forearm", rot(k(0, 0, 0, 0), k(1.2f, 15, 0, 0), k(9.5f, 15, 0, 0), k(10, 0, 0, 0)))
			.addBoneAnimation("sword", rot(k(0, 0, 0, 0), k(1.2f, 165, 0, 0), k(9.5f, 165, 0, 0), k(10, 0, 0, 0)))
			.addBoneAnimation("left_arm", rot(k(0, 0, 0, 0), k(1.2f, -55, 25, 0), k(9.5f, -55, 25, 0), k(10, 0, 0, 0)))
			.addBoneAnimation("head", rot(k(0, 0, 0, 0), k(1.2f, 18, 0, 0), k(1.8f, 18, 0, 0), k(2.1f, -28, 0, 0), k(9.5f, -28, 0, 0), k(10, 0, 0, 0)))
			.addBoneAnimation("waist", move(k(0, 0, 0, 0), k(1.8f, 0, 0, 0), k(2.2f, 0, 5, 0), k(9.5f, 0, 5, 0), k(10, 0, 0, 0)))
			.addBoneAnimation("halo", grow(l(0, 1), l(1.8f, 0.8f), l(2.1f, 1.9f), l(9.5f, 1.9f), l(10, 1)))
			.addBoneAnimation(WING_RU, rot(k(0, 0, 0, 0), k(1.8f, 0, 0, -20), k(2.1f, 0, 10, 34), k(9.5f, 0, 10, 34), k(10, 0, 0, 0)))
			.addBoneAnimation(WING_LU, rot(k(0, 0, 0, 0), k(1.8f, 0, 0, 20), k(2.1f, 0, -10, -34), k(9.5f, 0, -10, -34), k(10, 0, 0, 0)))
			.addBoneAnimation(WING_RL, rot(k(0, 0, 0, 0), k(2.1f, 0, 10, -26), k(9.5f, 0, 10, -26), k(10, 0, 0, 0)))
			.addBoneAnimation(WING_LL, rot(k(0, 0, 0, 0), k(2.1f, 0, -10, 26), k(9.5f, 0, -10, 26), k(10, 0, 0, 0)))
			.build();

	public static final Animation ROAR = Animation.Builder.create(2.5f)
			.addBoneAnimation("right_arm", rot(k(0, 0, 0, 0), k(0.5f, -20, 0, 75), k(1.9f, -20, 0, 75), k(2.5f, 0, 0, 0)))
			.addBoneAnimation("left_arm", rot(k(0, 0, 0, 0), k(0.5f, -20, 0, -75), k(1.9f, -20, 0, -75), k(2.5f, 0, 0, 0)))
			.addBoneAnimation("torso", rot(k(0, 0, 0, 0), k(0.3f, 12, 0, 0), k(0.6f, -18, 0, 0), k(1.9f, -18, 0, 0), k(2.5f, 0, 0, 0)))
			.addBoneAnimation("head", rot(k(0, 0, 0, 0), k(0.3f, 15, 0, 0), k(0.6f, -30, 0, 0), k(1.9f, -30, 0, 0), k(2.5f, 0, 0, 0)))
			.addBoneAnimation("waist", move(k(0, 0, 0, 0), k(0.6f, 0, 4, 0), k(1.9f, 0, 4, 0), k(2.5f, 0, 0, 0)))
			.addBoneAnimation("halo", grow(l(0, 1), l(0.5f, 0.7f), l(0.7f, 1.8f), l(1.9f, 1.8f), l(2.5f, 1)))
			.addBoneAnimation(WING_RU, rot(k(0, 0, 0, 0), k(0.6f, 0, 10, 32), k(1.9f, 0, 10, 32), k(2.5f, 0, 0, 0)))
			.addBoneAnimation(WING_LU, rot(k(0, 0, 0, 0), k(0.6f, 0, -10, -32), k(1.9f, 0, -10, -32), k(2.5f, 0, 0, 0)))
			.addBoneAnimation(WING_RL, rot(k(0, 0, 0, 0), k(0.6f, 0, 10, -24), k(1.9f, 0, 10, -24), k(2.5f, 0, 0, 0)))
			.addBoneAnimation(WING_LL, rot(k(0, 0, 0, 0), k(0.6f, 0, -10, 24), k(1.9f, 0, -10, 24), k(2.5f, 0, 0, 0)))
			.build();

	/** 4.5s to match EclipseWardenEntity.DEATH_LENGTH: slump, shudder, then collapse into the halo. */
	public static final Animation DEATH = Animation.Builder.create(4.5f)
			.addBoneAnimation("torso", rot(k(0, 0, 0, 0), k(0.6f, 35, 0, 0), k(3.9f, 42, 0, 0)))
			.addBoneAnimation("head", rot(k(0, 0, 0, 0), k(0.6f, 40, 0, 0), k(3.9f, 48, 0, 0)))
			.addBoneAnimation("right_arm", rot(k(0, 0, 0, 0), k(0.6f, 18, 0, 22), k(3.9f, 22, 0, 26)))
			.addBoneAnimation("left_arm", rot(k(0, 0, 0, 0), k(0.6f, 18, 0, -22), k(3.9f, 22, 0, -26)))
			.addBoneAnimation("sword", rot(k(0, 0, 0, 0), k(0.8f, 70, 0, 0), k(3.9f, 76, 0, 0)))
			.addBoneAnimation(WING_RU, rot(k(0, 0, 0, 0), k(0.8f, 0, 0, -55), k(3.9f, 0, 0, -60)))
			.addBoneAnimation(WING_LU, rot(k(0, 0, 0, 0), k(0.8f, 0, 0, 55), k(3.9f, 0, 0, 60)))
			.addBoneAnimation(WING_RL, rot(k(0, 0, 0, 0), k(0.8f, 0, 0, -30), k(3.9f, 0, 0, -34)))
			.addBoneAnimation(WING_LL, rot(k(0, 0, 0, 0), k(0.8f, 0, 0, 30), k(3.9f, 0, 0, 34)))
			.addBoneAnimation("waist", rot(k(0, 0, 0, 0), k(1, 0, 6, 0), k(1.5f, 0, -6, 0), k(2, 0, 7, 0), k(2.5f, 0, -7, 0),
					k(3, 0, 8, 0), k(3.5f, 0, -8, 0), k(3.9f, 0, 0, 0)))
			.addBoneAnimation("waist", move(k(0, 0, 0, 0), k(2, 0, -5, 0), k(3.9f, 0, 4, 0)))
			.addBoneAnimation("waist", grow(l(0, 1), l(3.9f, 1), l(4.4f, 0.02f), l(4.5f, 0.02f)))
			.addBoneAnimation("halo", grow(l(0, 1), l(3.0f, 1.3f), l(3.9f, 2.6f)))
			.build();

	private WardenAnimations() {
	}

	/** Smooth keyframe at time t (seconds). */
	private static float[] k(float t, float x, float y, float z) {
		return new float[] {t, x, y, z, 1};
	}

	/** Linear keyframe at time t; with two arguments, a uniform scale. */
	private static float[] l(float t, float x, float y, float z) {
		return new float[] {t, x, y, z, 0};
	}

	private static float[] l(float t, float scale) {
		return new float[] {t, scale, scale, scale, 0};
	}

	private static Transformation rot(float[]... keys) {
		return build(Transformation.Targets.ROTATE, 0, keys);
	}

	private static Transformation spin(float[]... keys) {
		return build(Transformation.Targets.ROTATE, 0, keys);
	}

	private static Transformation move(float[]... keys) {
		return build(Transformation.Targets.TRANSLATE, 1, keys);
	}

	private static Transformation grow(float[]... keys) {
		return build(Transformation.Targets.SCALE, 2, keys);
	}

	private static Transformation build(Transformation.Target target, int kind, float[]... keys) {
		Keyframe[] frames = new Keyframe[keys.length];
		for (int i = 0; i < keys.length; i++) {
			float[] key = keys[i];
			frames[i] = new Keyframe(key[0], switch (kind) {
				case 0 -> AnimationHelper.createRotationalVector(key[1], key[2], key[3]);
				case 1 -> AnimationHelper.createTranslationalVector(key[1], key[2], key[3]);
				default -> AnimationHelper.createScalingVector(key[1], key[2], key[3]);
			}, key[4] == 1 ? Transformation.Interpolations.CUBIC : Transformation.Interpolations.LINEAR);
		}
		return new Transformation(target, frames);
	}
}
