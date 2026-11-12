package com.eclipsewarden.entity;

import com.eclipsewarden.registry.ModEntities;
import com.eclipsewarden.registry.ModParticles;
import java.util.HashSet;
import java.util.Set;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.projectile.ProjectileEntity;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.RaycastContext;
import net.minecraft.world.World;

/** The Eclipse Blade's thrown crescent: flies straight, cuts through every creature in its path, stops at walls. */
public class EclipseSlashEntity extends ProjectileEntity {
	public static final int MAX_LIFE = 24;
	private final Set<Integer> hit = new HashSet<>();
	private float damage = 9.0f;
	private int life;

	public EclipseSlashEntity(EntityType<? extends EclipseSlashEntity> type, World world) {
		super(type, world);
	}

	public EclipseSlashEntity(World world, LivingEntity owner, float damage) {
		this(ModEntities.ECLIPSE_SLASH, world);
		setOwner(owner);
		this.damage = damage;
		Vec3d look = owner.getRotationVec(1.0f);
		setPosition(owner.getX() + look.x, owner.getEyeY() - 0.45, owner.getZ() + look.z);
		setYaw(owner.getYaw());
		setPitch(owner.getPitch());
	}

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
	}

	public int getLife() {
		return this.life;
	}

	@Override
	public void tick() {
		super.tick();
		Vec3d velocity = getVelocity();
		Vec3d next = getPos().add(velocity);
		this.life++;
		if (getWorld() instanceof ServerWorld world) {
			boolean blocked = world.raycast(new RaycastContext(getPos(), next, RaycastContext.ShapeType.COLLIDER,
					RaycastContext.FluidHandling.NONE, this)).getType() != HitResult.Type.MISS;
			Entity owner = getOwner();
			for (LivingEntity target : world.getEntitiesByClass(LivingEntity.class, getBoundingBox().expand(1.3, 0.5, 1.3),
					entity -> entity != owner && entity.isAlive() && !entity.isSpectator())) {
				if (this.hit.add(target.getId()) && target.damage(getDamageSources().indirectMagic(this, owner), this.damage)) {
					world.spawnParticles(ModParticles.ECLIPSE_SPARK, target.getX(), target.getBodyY(0.5), target.getZ(), 12, 0.3, 0.4, 0.3, 0.15);
				}
			}
			if (blocked || this.life >= MAX_LIFE) {
				world.spawnParticles(ModParticles.ECLIPSE_SPARK, getX(), getY() + 0.2, getZ(), 20, 0.6, 0.2, 0.6, 0.15);
				discard();
				return;
			}
		} else {
			Vec3d side = new Vec3d(-velocity.z, 0, velocity.x).normalize();
			for (int i = -1; i <= 1; i++) {
				getWorld().addParticle(ModParticles.ECLIPSE_SPARK, getX() + side.x * i * 0.9, getY() + 0.2, getZ() + side.z * i * 0.9, 0, 0, 0);
			}
		}
		setPosition(next);
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
