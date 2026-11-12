package com.eclipsewarden.entity;

import com.eclipsewarden.registry.ModEntities;
import com.eclipsewarden.registry.ModParticles;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.projectile.ProjectileEntity;
import net.minecraft.entity.projectile.ProjectileUtil;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.hit.EntityHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import org.jetbrains.annotations.Nullable;

/** A slow glowing bolt. The Warden's bolts curve toward their target; the scepter's fly straight. */
public class UmbralBoltEntity extends ProjectileEntity {
	private static final int MAX_LIFE = 80;
	private static final int HOMING_TICKS = 30;
	private float damage = 8.0f;
	private int life;
	@Nullable
	private LivingEntity homingTarget;

	public UmbralBoltEntity(EntityType<? extends UmbralBoltEntity> type, World world) {
		super(type, world);
	}

	public UmbralBoltEntity(World world, LivingEntity owner, float damage) {
		this(ModEntities.UMBRAL_BOLT, world);
		setOwner(owner);
		this.damage = damage;
	}

	public void setHomingTarget(@Nullable LivingEntity target) {
		this.homingTarget = target;
	}

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
	}

	@Override
	public void tick() {
		super.tick();
		Vec3d velocity = getVelocity();
		if (!getWorld().isClient) {
			if (++this.life > MAX_LIFE) {
				burst();
				return;
			}
			if (this.homingTarget != null && this.homingTarget.isAlive() && this.life < HOMING_TICKS) {
				Vec3d wanted = this.homingTarget.getPos().add(0, this.homingTarget.getHeight() * 0.5, 0).subtract(getPos()).normalize();
				velocity = velocity.normalize().lerp(wanted, 0.07).normalize().multiply(velocity.length());
				setVelocity(velocity);
				this.velocityDirty = true;
			}
		}
		HitResult hit = ProjectileUtil.getCollision(this, this::canHit);
		if (hit.getType() != HitResult.Type.MISS) {
			hitOrDeflect(hit);
			if (isRemoved()) {
				return;
			}
		}
		setPosition(getX() + velocity.x, getY() + velocity.y, getZ() + velocity.z);
		if (getWorld().isClient) {
			getWorld().addParticle(ModParticles.UMBRAL_WISP, getX(), getY() + 0.25, getZ(), 0, 0, 0);
			if (this.age % 2 == 0) {
				getWorld().addParticle(ModParticles.ECLIPSE_SPARK, getX(), getY() + 0.25, getZ(), 0, 0, 0);
			}
		}
	}

	@Override
	protected boolean canHit(Entity entity) {
		// the Warden's bolts ignore the Warden; the scepter's bolts ignore other players' pets only by vanilla rules
		return super.canHit(entity) && !(getOwner() instanceof EclipseWardenEntity && entity instanceof EclipseWardenEntity);
	}

	@Override
	protected void onEntityHit(EntityHitResult hit) {
		super.onEntityHit(hit);
		Entity owner = getOwner();
		Entity target = hit.getEntity();
		if (owner instanceof PlayerEntity) {
			target.damage(getDamageSources().indirectMagic(this, owner), this.damage);
		} else {
			target.damage(getDamageSources().mobProjectile(this, owner instanceof LivingEntity living ? living : null), this.damage);
		}
	}

	@Override
	protected void onCollision(HitResult hit) {
		super.onCollision(hit);
		if (!getWorld().isClient) {
			burst();
		}
	}

	private void burst() {
		if (getWorld() instanceof ServerWorld world) {
			world.spawnParticles(ModParticles.UMBRAL_WISP, getX(), getY() + 0.25, getZ(), 14, 0.2, 0.2, 0.2, 0.08);
			world.spawnParticles(ModParticles.ECLIPSE_SPARK, getX(), getY() + 0.25, getZ(), 8, 0.1, 0.1, 0.1, 0.2);
			world.playSound(null, getX(), getY(), getZ(), SoundEvents.BLOCK_AMETHYST_BLOCK_BREAK, SoundCategory.HOSTILE, 1.0f, 0.7f);
		}
		discard();
	}

	@Override
	public boolean shouldRender(double distance) {
		return distance < 96 * 96;
	}

	@Override
	protected void writeCustomDataToNbt(NbtCompound nbt) {
		super.writeCustomDataToNbt(nbt);
		nbt.putFloat("Damage", this.damage);
		nbt.putInt("Life", this.life);
	}

	@Override
	protected void readCustomDataFromNbt(NbtCompound nbt) {
		super.readCustomDataFromNbt(nbt);
		this.damage = nbt.getFloat("Damage");
		this.life = nbt.getInt("Life");
	}
}
