package com.eclipsewarden.client.model;

import com.eclipsewarden.EclipseWarden;
import com.eclipsewarden.entity.EclipseWardenEntity;
import net.minecraft.client.model.ModelPart;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.entity.model.EntityModelLayer;
import net.minecraft.client.render.entity.model.SinglePartEntityModel;
import net.minecraft.util.math.MathHelper;

public class EclipseWardenModel extends SinglePartEntityModel<EclipseWardenEntity> {
	public static final EntityModelLayer LAYER = new EntityModelLayer(EclipseWarden.id("eclipse_warden"), "main");
	private final ModelPart root;
	private final ModelPart waist;
	private final ModelPart head;
	private final ModelPart cape;

	public EclipseWardenModel(ModelPart root) {
		// translucent so the halo, wings and tattered cloth can have soft edges
		super(RenderLayer::getEntityTranslucent);
		this.root = root;
		this.waist = root.getChild("waist");
		ModelPart torso = this.waist.getChild("torso");
		this.head = torso.getChild("head");
		this.cape = torso.getChild("cape");
	}

	@Override
	public ModelPart getPart() {
		return this.root;
	}

	@Override
	public void setAngles(EclipseWardenEntity entity, float limbAngle, float limbDistance, float animationProgress, float headYaw, float headPitch) {
		getPart().traverse().forEach(ModelPart::resetTransform);
		this.head.yaw = headYaw * MathHelper.RADIANS_PER_DEGREE;
		this.head.pitch = headPitch * MathHelper.RADIANS_PER_DEGREE;
		// it glides rather than walks: lean into the movement and let the cape trail
		float lean = Math.min(limbDistance, 1.0f);
		this.waist.pitch += lean * 0.3f;
		this.cape.pitch += lean * 0.75f;

		updateAnimation(entity.idleState, WardenAnimations.IDLE, animationProgress);
		updateAnimation(entity.spawnState, WardenAnimations.SPAWN, animationProgress);
		updateAnimation(entity.slashState, WardenAnimations.SLASH, animationProgress);
		updateAnimation(entity.castState, WardenAnimations.CAST, animationProgress);
		updateAnimation(entity.slamState, WardenAnimations.SLAM, animationProgress);
		updateAnimation(entity.raiseState, WardenAnimations.RAISE, animationProgress);
		updateAnimation(entity.blinkState, WardenAnimations.BLINK, animationProgress);
		updateAnimation(entity.raysState, WardenAnimations.RAYS, animationProgress);
		updateAnimation(entity.roarState, WardenAnimations.ROAR, animationProgress);
		updateAnimation(entity.deathState, WardenAnimations.DEATH, animationProgress);
	}
}
