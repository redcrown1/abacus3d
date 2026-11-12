package com.eclipsewarden.entity;

import com.eclipsewarden.registry.ModItems;
import com.eclipsewarden.registry.ModParticles;
import com.eclipsewarden.world.ArenaBuilder;
import com.eclipsewarden.world.EclipsedCourt;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import net.minecraft.entity.AnimationState;
import net.minecraft.entity.EntityData;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.ExperienceOrbEntity;
import net.minecraft.entity.LightningEntity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.attribute.DefaultAttributeContainer;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.boss.BossBar;
import net.minecraft.entity.boss.ServerBossBar;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.particle.DustParticleEffect;
import net.minecraft.particle.ParticleEffect;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.tag.DamageTypeTags;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.LocalDifficulty;
import net.minecraft.world.ServerWorldAccess;
import net.minecraft.world.World;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

/**
 * The boss. It runs one attack at a time from a small state machine instead of AI goals; the
 * current attack and phase are synced so the client can play the matching animation.
 *
 * <p>Phases follow health: above two thirds, above one third, and the final third. Each phase
 * shortens the pause between attacks, strengthens them and unlocks one more (Starfall, then
 * Eclipse Rays).
 */
public class EclipseWardenEntity extends HostileEntity {
	public static final int ATTACK_NONE = 0;
	public static final int ATTACK_SPAWN = 1;
	public static final int ATTACK_SLASH = 2;
	public static final int ATTACK_BOLTS = 3;
	public static final int ATTACK_SLAM = 4;
	public static final int ATTACK_STARFALL = 5;
	public static final int ATTACK_BLINK = 6;
	public static final int ATTACK_RAYS = 7;
	public static final int ATTACK_ROAR = 8;

	public static final int DEATH_LENGTH = 90;
	private static final int SPAWN_LENGTH = 60;
	private static final int ROAR_LENGTH = 50;
	private static final int RAYS_CHARGE = 40;
	private static final int RAYS_LENGTH = 200;
	private static final double RAY_REACH = 23.0;
	private static final double SHOCKWAVE_SPEED = 0.6;
	private static final double SHOCKWAVE_REACH = 24.0;

	private static final TrackedData<Integer> ATTACK = DataTracker.registerData(EclipseWardenEntity.class, TrackedDataHandlerRegistry.INTEGER);
	private static final TrackedData<Integer> PHASE = DataTracker.registerData(EclipseWardenEntity.class, TrackedDataHandlerRegistry.INTEGER);
	private static final DustParticleEffect WARNING_DUST = new DustParticleEffect(new Vector3f(1.0f, 0.45f, 0.15f), 1.4f);

	private final ServerBossBar bossBar = new ServerBossBar(getDisplayName(), BossBar.Color.PURPLE, BossBar.Style.NOTCHED_6);
	private final List<Shockwave> shockwaves = new ArrayList<>();
	private final List<Strike> strikes = new ArrayList<>();
	private int attackTicks;
	private int cooldown = 30;
	private int lastAttack;
	private int raysCooldown;
	private int lonelyTicks;
	private int deathTicks;
	private boolean slamLanded;
	private Vec3d attackDir = new Vec3d(0, 0, 1);
	private double rayAngle;
	private int rayDirection = 1;

	// client-side animation clocks
	public final AnimationState idleState = new AnimationState();
	public final AnimationState spawnState = new AnimationState();
	public final AnimationState slashState = new AnimationState();
	public final AnimationState castState = new AnimationState();
	public final AnimationState slamState = new AnimationState();
	public final AnimationState raiseState = new AnimationState();
	public final AnimationState blinkState = new AnimationState();
	public final AnimationState raysState = new AnimationState();
	public final AnimationState roarState = new AnimationState();
	public final AnimationState deathState = new AnimationState();
	private int shownAttack = -1;

	public EclipseWardenEntity(EntityType<? extends EclipseWardenEntity> type, World world) {
		super(type, world);
		this.experiencePoints = 0;
		setPersistent();
	}

	public static DefaultAttributeContainer.Builder createAttributes() {
		return HostileEntity.createHostileAttributes()
				.add(EntityAttributes.GENERIC_MAX_HEALTH, 320.0)
				.add(EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.3)
				.add(EntityAttributes.GENERIC_ATTACK_DAMAGE, 14.0)
				.add(EntityAttributes.GENERIC_ARMOR, 8.0)
				.add(EntityAttributes.GENERIC_KNOCKBACK_RESISTANCE, 1.0)
				.add(EntityAttributes.GENERIC_FOLLOW_RANGE, 64.0);
	}

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
		super.initDataTracker(builder);
		builder.add(ATTACK, ATTACK_NONE);
		builder.add(PHASE, 1);
	}

	@Override
	protected void initGoals() {
		this.goalSelector.add(0, new SwimGoal(this));
	}

	public int getAttack() {
		return this.dataTracker.get(ATTACK);
	}

	public int getPhase() {
		return this.dataTracker.get(PHASE);
	}

	@Override
	@Nullable
	public EntityData initialize(ServerWorldAccess world, LocalDifficulty difficulty, SpawnReason spawnReason, @Nullable EntityData entityData) {
		beginSpawnSequence();
		return super.initialize(world, difficulty, spawnReason, entityData);
	}

	/** Makes the Warden rise out of the ground, untouchable, before the fight starts. */
	public void beginSpawnSequence() {
		startAttack(ATTACK_SPAWN);
	}

	// ------------------------------------------------------------------ fight loop

	@Override
	protected void mobTick() {
		super.mobTick();
		ServerWorld world = (ServerWorld) getWorld();
		this.bossBar.setPercent(getHealth() / getMaxHealth());
		tickShockwaves(world);
		tickStrikes(world);
		if (this.raysCooldown > 0) {
			this.raysCooldown--;
		}

		boolean inCourt = world.getRegistryKey() == EclipsedCourt.WORLD_KEY;
		if (inCourt && getY() < ArenaBuilder.FLOOR_Y - 6) {
			// knocked or leapt off the edge: step back onto the arena
			requestTeleport(EclipsedCourt.WARDEN_SPAWN.x, EclipsedCourt.WARDEN_SPAWN.y, EclipsedCourt.WARDEN_SPAWN.z);
			setVelocity(Vec3d.ZERO);
		}

		LivingEntity target = getTarget();
		if (!(target instanceof PlayerEntity player) || !isValidTarget(player)) {
			target = findTarget();
			setTarget(target);
		}
		if (inCourt) {
			// with every challenger dead or gone the Warden returns to rest and the Court resets
			this.lonelyTicks = target == null ? this.lonelyTicks + 1 : 0;
			if (this.lonelyTicks > 200) {
				world.spawnParticles(ParticleTypes.REVERSE_PORTAL, getX(), getBodyY(0.5), getZ(), 80, 0.5, 1.4, 0.5, 0.1);
				discard();
				return;
			}
		}

		int attack = getAttack();
		if (attack != ATTACK_NONE) {
			this.attackTicks++;
			tickAttack(world, attack, target);
			return;
		}
		int phase = phaseForHealth();
		if (phase > getPhase()) {
			this.dataTracker.set(PHASE, phase);
			startAttack(ATTACK_ROAR);
			return;
		}
		if (target == null) {
			getNavigation().stop();
			return;
		}
		getLookControl().lookAt(target, 30.0f, 30.0f);
		double distance = distanceTo(target);
		if (distance > 3.2) {
			getNavigation().startMovingTo(target, 1.0);
		} else {
			getNavigation().stop();
		}
		if (--this.cooldown <= 0) {
			startAttack(chooseAttack(target, distance));
		}
	}

	private int phaseForHealth() {
		float fraction = getHealth() / getMaxHealth();
		return fraction > 0.66f ? 1 : fraction > 0.33f ? 2 : 3;
	}

	private boolean isValidTarget(PlayerEntity player) {
		return player.isAlive() && !player.isCreative() && !player.isSpectator() && player.getWorld() == getWorld()
				&& squaredDistanceTo(player) < 64 * 64;
	}

	@Nullable
	private PlayerEntity findTarget() {
		PlayerEntity best = null;
		for (PlayerEntity player : getWorld().getPlayers()) {
			if (isValidTarget(player) && (best == null || squaredDistanceTo(player) < squaredDistanceTo(best))) {
				best = player;
			}
		}
		return best;
	}

	private int chooseAttack(LivingEntity target, double distance) {
		int phase = getPhase();
		boolean outOfReach = target.getY() - getY() > 4 || distance > 20;
		int[][] options = {
			{ATTACK_SLASH, distance < 5.5 ? 5 : 0},
			{ATTACK_SLAM, outOfReach ? 0 : 3},
			{ATTACK_BOLTS, distance < 5.5 ? 1 : 4},
			{ATTACK_BLINK, distance < 5.5 ? 0 : outOfReach ? 8 : 4},
			{ATTACK_STARFALL, phase >= 2 ? 3 : 0},
			{ATTACK_RAYS, phase >= 3 && this.raysCooldown <= 0 ? 4 : 0},
		};
		int total = 0;
		for (int[] option : options) {
			if (option[0] == this.lastAttack) {
				option[1] = 0;
			}
			total += option[1];
		}
		if (total == 0) {
			return ATTACK_BOLTS;
		}
		int roll = this.random.nextInt(total);
		for (int[] option : options) {
			roll -= option[1];
			if (roll < 0) {
				return option[0];
			}
		}
		return ATTACK_BOLTS;
	}

	private void startAttack(int attack) {
		this.dataTracker.set(ATTACK, attack);
		this.attackTicks = 0;
		this.slamLanded = false;
		if (attack != ATTACK_ROAR && attack != ATTACK_SPAWN) {
			this.lastAttack = attack;
		}
		getNavigation().stop();
	}

	private void endAttack() {
		this.dataTracker.set(ATTACK, ATTACK_NONE);
		this.attackTicks = 0;
		this.cooldown = 34 - 8 * getPhase();
	}

	/** Attack damage grows 15% per phase. */
	private float scaled(float base) {
		return base * (1.0f + 0.15f * (getPhase() - 1));
	}

	private void aimAt(@Nullable LivingEntity target) {
		if (target != null) {
			Vec3d flat = new Vec3d(target.getX() - getX(), 0, target.getZ() - getZ());
			if (flat.lengthSquared() > 1.0E-4) {
				this.attackDir = flat.normalize();
			}
		}
		float yaw = (float) (MathHelper.atan2(this.attackDir.z, this.attackDir.x) * 180.0 / Math.PI) - 90.0f;
		setYaw(yaw);
		this.bodyYaw = yaw;
		this.headYaw = yaw;
	}

	private void tickAttack(ServerWorld world, int attack, @Nullable LivingEntity target) {
		int t = this.attackTicks;
		switch (attack) {
			case ATTACK_SPAWN -> tickSpawn(world, t);
			case ATTACK_SLASH -> tickSlash(world, t, target);
			case ATTACK_BOLTS -> tickBolts(world, t, target);
			case ATTACK_SLAM -> tickSlam(world, t, target);
			case ATTACK_STARFALL -> tickStarfall(world, t);
			case ATTACK_BLINK -> tickBlink(world, t, target);
			case ATTACK_RAYS -> tickRays(world, t);
			case ATTACK_ROAR -> tickRoar(world, t);
			default -> endAttack();
		}
	}

	// ------------------------------------------------------------------ attacks

	private void tickSpawn(ServerWorld world, int t) {
		if (t == 1) {
			sound(SoundEvents.ENTITY_WITHER_SPAWN, 1.2f, 0.7f);
		}
		world.spawnParticles(ModParticles.UMBRAL_WISP, getX(), getY() + 0.2, getZ(), 6, 1.2, 0.1, 1.2, 0.02);
		world.spawnParticles(ModParticles.ECLIPSE_SPARK, getX(), getY() + t * 0.05, getZ(), 3, 0.5, 0.6, 0.5, 0.05);
		if (t == 40) {
			sound(SoundEvents.ENTITY_WARDEN_ROAR, 2.5f, 0.75f);
			world.spawnParticles(ModParticles.ECLIPSE_SPARK, getX(), getBodyY(0.6), getZ(), 150, 0.4, 0.8, 0.4, 0.5);
			world.spawnParticles(ParticleTypes.FLASH, getX(), getBodyY(0.6), getZ(), 1, 0, 0, 0, 0);
		}
		if (t >= SPAWN_LENGTH) {
			endAttack();
			this.cooldown = 20;
		}
	}

	private void tickSlash(ServerWorld world, int t, @Nullable LivingEntity target) {
		boolean twice = getPhase() >= 2;
		if (t == 1) {
			aimAt(target);
			sound(SoundEvents.ENTITY_BLAZE_SHOOT, 1.0f, 0.5f);
		}
		if (t < 9) {
			aimAt(target);
		}
		if (t == 9 && target != null) {
			// short hop so ground friction does not eat the lunge
			double reach = MathHelper.clamp(distanceTo(target) - 2.5, 0.0, 6.0);
			setVelocity(this.attackDir.x * reach / 5.4, 0.3, this.attackDir.z * reach / 5.4);
		}
		if (t == 13) {
			slash(world, 5.5, 70.0);
		}
		if (twice && t == 17) {
			aimAt(target);
		}
		if (twice && t == 21) {
			slash(world, 5.0, 180.0);
		}
		if (t >= (twice ? 30 : 24)) {
			endAttack();
		}
	}

	private void slash(ServerWorld world, double range, double halfAngle) {
		sound(SoundEvents.ENTITY_PLAYER_ATTACK_SWEEP, 1.6f, 0.5f);
		sound(SoundEvents.ENTITY_IRON_GOLEM_ATTACK, 1.0f, 0.6f);
		double facing = Math.atan2(this.attackDir.z, this.attackDir.x);
		double spread = Math.toRadians(halfAngle);
		for (double a = -spread; a <= spread; a += 0.12) {
			for (double r = 2.0; r <= range; r += 1.1) {
				world.spawnParticles(ModParticles.ECLIPSE_SPARK, getX() + Math.cos(facing + a) * r, getY() + 1.5,
						getZ() + Math.sin(facing + a) * r, 1, 0.1, 0.25, 0.1, 0.02);
			}
		}
		world.spawnParticles(ParticleTypes.SWEEP_ATTACK, getX() + this.attackDir.x * 2.5, getY() + 1.6, getZ() + this.attackDir.z * 2.5,
				4, 1.2, 0.3, 1.2, 0);
		double minDot = Math.cos(spread);
		for (LivingEntity victim : victims(range + 1)) {
			Vec3d flat = new Vec3d(victim.getX() - getX(), 0, victim.getZ() - getZ());
			double distance = flat.length();
			if (distance > range || Math.abs(victim.getY() - getY()) > 4) {
				continue;
			}
			if (distance > 0.5 && flat.normalize().dotProduct(this.attackDir) < minDot) {
				continue;
			}
			if (victim.damage(getDamageSources().mobAttack(this), scaled(14.0f))) {
				victim.takeKnockback(1.3, getX() - victim.getX(), getZ() - victim.getZ());
			}
		}
	}

	private void tickBolts(ServerWorld world, int t, @Nullable LivingEntity target) {
		int phase = getPhase();
		int volleys = 2 + phase;
		aimAt(target);
		if (t == 1) {
			sound(SoundEvents.ENTITY_EVOKER_CAST_SPELL, 1.5f, 0.7f);
		}
		Vec3d hand = handPos();
		world.spawnParticles(ModParticles.UMBRAL_WISP, hand.x, hand.y, hand.z, 3, 0.25, 0.25, 0.25, 0.02);
		int since = t - 12;
		if (target != null && since >= 0 && since % 6 == 0 && since / 6 < volleys) {
			sound(SoundEvents.ENTITY_SHULKER_SHOOT, 1.5f, 0.6f);
			Vec3d aim = target.getPos().add(0, target.getHeight() * 0.5, 0).subtract(hand).normalize();
			int fan = phase >= 3 ? 1 : 0;
			for (int i = -fan; i <= fan; i++) {
				UmbralBoltEntity bolt = new UmbralBoltEntity(world, this, scaled(8.0f));
				bolt.setPosition(hand);
				bolt.setVelocity(aim.rotateY(i * 0.22f).multiply(0.75 + 0.1 * phase));
				bolt.setHomingTarget(i == 0 ? target : null);
				world.spawnEntity(bolt);
			}
		}
		if (t >= 12 + volleys * 6 + 8) {
			endAttack();
		}
	}

	/** Roughly where the left hand's orb floats. */
	private Vec3d handPos() {
		return getPos().add(-this.attackDir.z * -1.0 + this.attackDir.x * 0.8, 2.3, this.attackDir.x * -1.0 + this.attackDir.z * 0.8);
	}

	private void tickSlam(ServerWorld world, int t, @Nullable LivingEntity target) {
		if (t == 1) {
			aimAt(target);
			sound(SoundEvents.ENTITY_RAVAGER_ROAR, 1.5f, 0.6f);
			double reach = target == null ? 0 : Math.min(distanceTo(target), 12.0);
			// airborne drag (0.91 per tick) means an arc covers about 9.4 times its launch speed
			setVelocity(this.attackDir.x * reach / 9.4, 0.95, this.attackDir.z * reach / 9.4);
		}
		if (t == 13) {
			setVelocity(getVelocity().x, -1.5, getVelocity().z);
		}
		if (!this.slamLanded && ((t > 13 && isOnGround()) || t > 45)) {
			this.slamLanded = true;
			this.attackTicks = 100;
			sound(SoundEvents.ENTITY_GENERIC_EXPLODE.value(), 2.0f, 0.6f);
			sound(SoundEvents.ENTITY_WARDEN_SONIC_BOOM, 1.5f, 0.6f);
			world.spawnParticles(ParticleTypes.EXPLOSION, getX(), getY() + 0.5, getZ(), 8, 1.5, 0.3, 1.5, 0);
			world.spawnParticles(ModParticles.ECLIPSE_SPARK, getX(), getY() + 0.3, getZ(), 80, 1.0, 0.2, 1.0, 0.4);
			for (LivingEntity victim : victims(3.2)) {
				if (victim.distanceTo(this) < 3.2) {
					victim.damage(getDamageSources().mobAttack(this), scaled(12.0f));
				}
			}
			this.shockwaves.add(new Shockwave(getPos(), 0));
			if (getPhase() >= 3) {
				this.shockwaves.add(new Shockwave(getPos(), -12));
			}
		}
		if (this.slamLanded && this.attackTicks >= 116) {
			endAttack();
		}
	}

	private void tickStarfall(ServerWorld world, int t) {
		if (t == 1) {
			sound(SoundEvents.ENTITY_EVOKER_PREPARE_ATTACK, 2.0f, 0.6f);
			int extra = 2 + getPhase();
			for (PlayerEntity player : world.getPlayers()) {
				if (!isValidTarget(player)) {
					continue;
				}
				this.strikes.add(new Strike(groundBelow(player.getPos()), 30));
				for (int i = 0; i < extra; i++) {
					double angle = this.random.nextDouble() * Math.PI * 2;
					double radius = 2.5 + this.random.nextDouble() * 5.0;
					Vec3d spot = player.getPos().add(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
					this.strikes.add(new Strike(groundBelow(spot), 36 + i * 5));
				}
			}
		}
		Vec3d tip = getPos().add(0, 4.4, 0);
		world.spawnParticles(ModParticles.ECLIPSE_SPARK, tip.x, tip.y, tip.z, 4, 0.2, 0.4, 0.2, 0.1);
		if (t >= 40) {
			endAttack();
		}
	}

	private Vec3d groundBelow(Vec3d from) {
		BlockPos.Mutable pos = new BlockPos.Mutable(MathHelper.floor(from.x), MathHelper.floor(from.y + 1), MathHelper.floor(from.z));
		for (int i = 0; i < 10; i++) {
			if (!getWorld().getBlockState(pos).getCollisionShape(getWorld(), pos).isEmpty()) {
				return new Vec3d(from.x, pos.getY() + 1, from.z);
			}
			pos.move(0, -1, 0);
		}
		return from;
	}

	private void tickBlink(ServerWorld world, int t, @Nullable LivingEntity target) {
		if (target == null) {
			endAttack();
			return;
		}
		if (t == 1) {
			sound(SoundEvents.ENTITY_ENDERMAN_TELEPORT, 1.5f, 0.5f);
			world.spawnParticles(ParticleTypes.REVERSE_PORTAL, getX(), getBodyY(0.5), getZ(), 60, 0.4, 1.2, 0.4, 0.05);
		}
		if (t == 8) {
			Vec3d from = getPos();
			Vec3d spot = blinkSpot(target);
			requestTeleport(spot.x, spot.y, spot.z);
			setVelocity(Vec3d.ZERO);
			for (int i = 0; i <= 12; i++) {
				Vec3d p = from.lerp(spot, i / 12.0);
				world.spawnParticles(ModParticles.UMBRAL_WISP, p.x, p.y + 1.6, p.z, 4, 0.3, 0.8, 0.3, 0.01);
			}
			world.spawnParticles(ModParticles.ECLIPSE_SPARK, spot.x, spot.y + 1.7, spot.z, 40, 0.4, 1.2, 0.4, 0.2);
			sound(SoundEvents.ENTITY_ENDERMAN_TELEPORT, 1.5f, 0.7f);
			aimAt(target);
		}
		if (t >= 10) {
			startAttack(ATTACK_SLASH);
		}
	}

	/** Prefers the spot behind the target's back, then any free spot around them. */
	private Vec3d blinkSpot(LivingEntity target) {
		Vec3d look = target.getRotationVec(1.0f);
		double base = Math.atan2(-look.z, -look.x);
		for (int i = 0; i < 8; i++) {
			double angle = base + (i % 2 == 0 ? 1 : -1) * ((i + 1) / 2) * Math.PI / 4;
			Vec3d spot = target.getPos().add(Math.cos(angle) * 3.0, 0, Math.sin(angle) * 3.0);
			BlockPos below = BlockPos.ofFloored(spot.x, spot.y - 0.5, spot.z);
			boolean floor = !getWorld().getBlockState(below).getCollisionShape(getWorld(), below).isEmpty();
			if (floor && getWorld().isSpaceEmpty(this, getBoundingBox().offset(spot.subtract(getPos())))) {
				return spot;
			}
		}
		return target.getPos();
	}

	private void tickRays(ServerWorld world, int t) {
		setVelocity(0, Math.min(getVelocity().y, 0), 0);
		if (t == 1) {
			if (world.getRegistryKey() == EclipsedCourt.WORLD_KEY) {
				world.spawnParticles(ParticleTypes.REVERSE_PORTAL, getX(), getBodyY(0.5), getZ(), 60, 0.4, 1.2, 0.4, 0.05);
				requestTeleport(EclipsedCourt.WARDEN_SPAWN.x, EclipsedCourt.WARDEN_SPAWN.y, EclipsedCourt.WARDEN_SPAWN.z);
			}
			sound(SoundEvents.ENTITY_WARDEN_SONIC_CHARGE, 3.0f, 0.6f);
			sound(SoundEvents.BLOCK_BEACON_ACTIVATE, 3.0f, 0.5f);
			this.rayAngle = this.random.nextDouble() * Math.PI * 2;
			this.rayDirection = this.random.nextBoolean() ? 1 : -1;
		}
		if (t < RAYS_CHARGE) {
			// faint lines show where the rays will ignite
			world.spawnParticles(ParticleTypes.REVERSE_PORTAL, getX(), getY() + 2, getZ(), 20, 2.5, 1.5, 2.5, 0.2);
			if (t % 3 == 0) {
				for (int arm = 0; arm < 4; arm++) {
					double angle = this.rayAngle + arm * Math.PI / 2;
					for (double r = 2; r <= RAY_REACH; r += 2.5) {
						world.spawnParticles(WARNING_DUST, getX() + Math.cos(angle) * r, getY() + 0.3, getZ() + Math.sin(angle) * r, 1, 0, 0, 0, 0);
					}
				}
			}
			return;
		}
		if (t == RAYS_CHARGE) {
			sound(SoundEvents.ENTITY_WARDEN_SONIC_BOOM, 3.0f, 0.5f);
		}
		this.rayAngle += this.rayDirection * Math.toRadians(1.3);
		if (t % 20 == 0) {
			sound(SoundEvents.BLOCK_BEACON_AMBIENT, 3.0f, 1.6f);
		}
		if (t % 50 == 0) {
			// keeps anyone hugging the Warden honest
			this.shockwaves.add(new Shockwave(getPos(), 0));
			sound(SoundEvents.ENTITY_WARDEN_SONIC_BOOM, 1.5f, 0.9f);
		}
		List<LivingEntity> victims = victims(RAY_REACH + 1);
		for (int arm = 0; arm < 4; arm++) {
			double angle = this.rayAngle + arm * Math.PI / 2;
			double dx = Math.cos(angle);
			double dz = Math.sin(angle);
			for (double r = 2 + (t % 2) * 0.65; r <= RAY_REACH; r += 1.3) {
				world.spawnParticles(ModParticles.ECLIPSE_SPARK, getX() + dx * r, getY() + 0.5 + (r % 2.6 < 1.3 ? 0.9 : 0), getZ() + dz * r,
						1, 0.05, 0.1, 0.05, 0);
			}
			for (LivingEntity victim : victims) {
				double rx = victim.getX() - getX();
				double rz = victim.getZ() - getZ();
				double along = rx * dx + rz * dz;
				if (along < 1.5 || along > RAY_REACH + 0.5 || Math.abs(victim.getY() - getY()) > 3) {
					continue;
				}
				if (Math.abs(rx * dz - rz * dx) < 0.8) {
					victim.damage(getDamageSources().indirectMagic(this, this), scaled(7.0f));
				}
			}
		}
		if (t >= RAYS_LENGTH) {
			this.raysCooldown = 500;
			endAttack();
		}
	}

	private void tickRoar(ServerWorld world, int t) {
		if (t == 1) {
			sound(SoundEvents.ENTITY_WARDEN_ROAR, 3.0f, 0.7f);
			sound(SoundEvents.ENTITY_ENDER_DRAGON_GROWL, 2.0f, 0.6f);
		}
		world.spawnParticles(ModParticles.UMBRAL_WISP, getX(), getBodyY(0.5), getZ(), 8, 0.8, 1.4, 0.8, 0.05);
		if (t == 12) {
			world.spawnParticles(ParticleTypes.SONIC_BOOM, getX(), getBodyY(0.6), getZ(), 1, 0, 0, 0, 0);
			world.spawnParticles(ModParticles.ECLIPSE_SPARK, getX(), getBodyY(0.6), getZ(), 200, 0.5, 0.8, 0.5, 0.7);
			for (LivingEntity victim : victims(12)) {
				Vec3d away = new Vec3d(victim.getX() - getX(), 0, victim.getZ() - getZ());
				if (away.length() > 12) {
					continue;
				}
				away = away.lengthSquared() < 1.0E-4 ? new Vec3d(1, 0, 0) : away.normalize();
				victim.damage(getDamageSources().indirectMagic(this, this), 4.0f);
				victim.setVelocity(away.x * 1.5, 0.55, away.z * 1.5);
				victim.velocityModified = true;
			}
			for (int i = 0; i < getPhase(); i++) {
				double angle = this.random.nextDouble() * Math.PI * 2;
				LightningEntity bolt = EntityType.LIGHTNING_BOLT.create(world);
				if (bolt != null) {
					bolt.refreshPositionAfterTeleport(getX() + Math.cos(angle) * 9, getY(), getZ() + Math.sin(angle) * 9);
					bolt.setCosmetic(true);
					world.spawnEntity(bolt);
				}
			}
		}
		if (t >= ROAR_LENGTH) {
			endAttack();
			this.cooldown = 10;
		}
	}

	// ------------------------------------------------------------------ lingering hazards

	/** An expanding ground ring; it only hurts what is standing on the floor, so jump it. */
	private void tickShockwaves(ServerWorld world) {
		for (Iterator<Shockwave> it = this.shockwaves.iterator(); it.hasNext();) {
			Shockwave wave = it.next();
			if (++wave.age < 0) {
				continue;
			}
			double radius = wave.age * SHOCKWAVE_SPEED;
			if (radius > SHOCKWAVE_REACH) {
				it.remove();
				continue;
			}
			int points = Math.max(10, (int) (radius * Math.PI * 2 / 1.2));
			double offset = wave.age * 0.37;
			for (int i = 0; i < points; i++) {
				double angle = offset + i * Math.PI * 2 / points;
				world.spawnParticles(ModParticles.ECLIPSE_SPARK, wave.origin.x + Math.cos(angle) * radius, wave.origin.y + 0.2,
						wave.origin.z + Math.sin(angle) * radius, 1, 0.05, 0.08, 0.05, 0);
			}
			for (LivingEntity victim : victims(radius + 2)) {
				double distance = Math.hypot(victim.getX() - wave.origin.x, victim.getZ() - wave.origin.z);
				if (Math.abs(distance - radius) > 0.9 || !victim.isOnGround() || Math.abs(victim.getY() - wave.origin.y) > 1.5
						|| !wave.hit.add(victim.getId())) {
					continue;
				}
				if (victim.damage(getDamageSources().indirectMagic(this, this), scaled(10.0f))) {
					victim.setVelocity(victim.getVelocity().x, 0.6, victim.getVelocity().z);
					victim.velocityModified = true;
				}
			}
		}
	}

	/** Telegraphed pillars of light: a ring on the floor, then the strike. */
	private void tickStrikes(ServerWorld world) {
		for (Iterator<Strike> it = this.strikes.iterator(); it.hasNext();) {
			Strike strike = it.next();
			Vec3d p = strike.pos;
			if (--strike.delay > 0) {
				if (strike.delay % 2 == 0) {
					for (int i = 0; i < 10; i++) {
						double angle = i * Math.PI / 5 + strike.delay * 0.2;
						world.spawnParticles(WARNING_DUST, p.x + Math.cos(angle) * 2.5, p.y + 0.15, p.z + Math.sin(angle) * 2.5, 1, 0, 0, 0, 0);
					}
					world.spawnParticles(ModParticles.ECLIPSE_SPARK, p.x, p.y + 10 + strike.delay * 0.4, p.z, 1, 0.1, 0.1, 0.1, 0);
				}
				continue;
			}
			it.remove();
			for (double h = 0; h < 18; h += 0.7) {
				world.spawnParticles(ParticleTypes.END_ROD, p.x, p.y + h, p.z, 2, 0.25, 0.3, 0.25, 0.02);
			}
			world.spawnParticles(ParticleTypes.FLASH, p.x, p.y + 1, p.z, 1, 0, 0, 0, 0);
			world.spawnParticles(ParticleTypes.EXPLOSION, p.x, p.y + 0.8, p.z, 2, 0.8, 0.2, 0.8, 0);
			world.spawnParticles(ModParticles.ECLIPSE_SPARK, p.x, p.y + 0.4, p.z, 40, 0.6, 0.2, 0.6, 0.4);
			world.playSound(null, p.x, p.y, p.z, SoundEvents.ENTITY_LIGHTNING_BOLT_IMPACT, SoundCategory.HOSTILE, 1.5f, 1.3f);
			world.playSound(null, p.x, p.y, p.z, SoundEvents.ENTITY_FIREWORK_ROCKET_LARGE_BLAST, SoundCategory.HOSTILE, 2.0f, 0.6f);
			for (LivingEntity victim : victims(40)) {
				if (Math.hypot(victim.getX() - p.x, victim.getZ() - p.z) < 2.6 && Math.abs(victim.getY() - p.y) < 4) {
					victim.damage(getDamageSources().indirectMagic(this, this), scaled(14.0f));
				}
			}
		}
	}

	private List<LivingEntity> victims(double range) {
		return getWorld().getEntitiesByClass(LivingEntity.class, getBoundingBox().expand(range), entity -> entity != this
				&& entity.isAlive() && !(entity instanceof EclipseWardenEntity)
				&& !(entity instanceof PlayerEntity player && (player.isCreative() || player.isSpectator())));
	}

	private void sound(SoundEvent event, float volume, float pitch) {
		getWorld().playSound(null, getX(), getY(), getZ(), event, SoundCategory.HOSTILE, volume, pitch);
	}

	// ------------------------------------------------------------------ damage and death

	@Override
	public boolean isInvulnerableTo(DamageSource source) {
		int attack = getAttack();
		if ((attack == ATTACK_SPAWN || attack == ATTACK_ROAR) && !source.isIn(DamageTypeTags.BYPASSES_INVULNERABILITY)) {
			return true;
		}
		return super.isInvulnerableTo(source);
	}

	@Override
	public boolean handleFallDamage(float fallDistance, float damageMultiplier, DamageSource damageSource) {
		return false;
	}

	@Override
	public void onDeath(DamageSource source) {
		this.dataTracker.set(ATTACK, ATTACK_NONE);
		this.shockwaves.clear();
		this.strikes.clear();
		super.onDeath(source);
	}

	@Override
	protected void dropLoot(DamageSource source, boolean causedByPlayer) {
		// the reward is dropped by hand once the death sequence ends
	}

	/** Replaces the vanilla topple-and-poof with a slow unravelling into light. */
	@Override
	protected void updatePostDeath() {
		this.deathTicks++;
		if (!(getWorld() instanceof ServerWorld world)) {
			return;
		}
		setVelocity(0, Math.min(getVelocity().y, 0), 0);
		if (this.deathTicks == 1) {
			sound(SoundEvents.ENTITY_WITHER_DEATH, 2.0f, 0.7f);
			this.bossBar.setPercent(0);
		}
		float progress = this.deathTicks / (float) DEATH_LENGTH;
		world.spawnParticles(ModParticles.ECLIPSE_SPARK, getX(), getY() + 1.8, getZ(), 4 + (int) (progress * 10), 0.5, 1.2, 0.5, 0.1 + progress * 0.3);
		world.spawnParticles(ParticleTypes.END_ROD, getX(), getY() + 1.8, getZ(), 2, 0.3, 1.0, 0.3, 0.15);
		if (this.deathTicks % 12 == 0) {
			world.spawnParticles(ParticleTypes.EXPLOSION, getX(), getY() + 1.8, getZ(), 2, 0.7, 1.2, 0.7, 0);
			sound(SoundEvents.ENTITY_GENERIC_EXPLODE.value(), 1.5f, 0.6f + progress);
		}
		if (this.deathTicks < DEATH_LENGTH) {
			return;
		}
		world.spawnParticles(ParticleTypes.FLASH, getX(), getY() + 2, getZ(), 2, 0.2, 0.2, 0.2, 0);
		world.spawnParticles(ParticleTypes.EXPLOSION_EMITTER, getX(), getY() + 2, getZ(), 1, 0, 0, 0, 0);
		world.spawnParticles(ModParticles.ECLIPSE_SPARK, getX(), getY() + 2, getZ(), 300, 0.4, 0.8, 0.4, 0.8);
		world.spawnParticles(ModParticles.UMBRAL_WISP, getX(), getY() + 2, getZ(), 120, 1.5, 1.5, 1.5, 0.08);
		sound(SoundEvents.ENTITY_GENERIC_EXPLODE.value(), 3.0f, 0.5f);
		sound(SoundEvents.UI_TOAST_CHALLENGE_COMPLETE, 2.0f, 0.8f);
		dropStack(new ItemStack(ModItems.ECLIPSE_BLADE));
		dropStack(new ItemStack(ModItems.ECLIPSE_CORE));
		dropStack(new ItemStack(ModItems.UMBRAL_SHARD, 8 + this.random.nextInt(5)));
		ExperienceOrbEntity.spawn(world, getPos().add(0, 1, 0), 500);
		remove(RemovalReason.KILLED);
		EclipsedCourt.onWardenDefeated(world);
	}

	// ------------------------------------------------------------------ client visuals

	@Override
	public void tick() {
		super.tick();
		if (getWorld().isClient) {
			tickClient();
		}
	}

	private void tickClient() {
		this.idleState.startIfNotRunning(this.age);
		int attack = isDead() ? -2 : getAttack();
		if (attack != this.shownAttack) {
			this.shownAttack = attack;
			for (AnimationState state : new AnimationState[] {this.spawnState, this.slashState, this.castState, this.slamState,
					this.raiseState, this.blinkState, this.raysState, this.roarState, this.deathState}) {
				state.stop();
			}
			AnimationState next = switch (attack) {
				case -2 -> this.deathState;
				case ATTACK_SPAWN -> this.spawnState;
				case ATTACK_SLASH -> this.slashState;
				case ATTACK_BOLTS -> this.castState;
				case ATTACK_SLAM -> this.slamState;
				case ATTACK_STARFALL -> this.raiseState;
				case ATTACK_BLINK -> this.blinkState;
				case ATTACK_RAYS -> this.raysState;
				case ATTACK_ROAR -> this.roarState;
				default -> null;
			};
			if (next != null) {
				next.start(this.age);
			}
		}
		if (this.random.nextInt(getPhase() >= 3 ? 1 : 2) == 0) {
			ParticleEffect effect = getPhase() >= 2 && this.random.nextBoolean() ? ModParticles.ECLIPSE_SPARK : ModParticles.UMBRAL_WISP;
			getWorld().addParticle(effect, getParticleX(0.9), getY() + this.random.nextDouble() * 1.4, getParticleZ(0.9), 0, 0.02, 0);
		}
	}

	// ------------------------------------------------------------------ boilerplate

	@Override
	public void onStartedTrackingBy(ServerPlayerEntity player) {
		super.onStartedTrackingBy(player);
		this.bossBar.addPlayer(player);
	}

	@Override
	public void onStoppedTrackingBy(ServerPlayerEntity player) {
		super.onStoppedTrackingBy(player);
		this.bossBar.removePlayer(player);
	}

	@Override
	public void setCustomName(@Nullable Text name) {
		super.setCustomName(name);
		this.bossBar.setName(getDisplayName());
	}

	@Override
	public void writeCustomDataToNbt(NbtCompound nbt) {
		super.writeCustomDataToNbt(nbt);
		nbt.putInt("Phase", getPhase());
	}

	@Override
	public void readCustomDataFromNbt(NbtCompound nbt) {
		super.readCustomDataFromNbt(nbt);
		if (nbt.contains("Phase")) {
			this.dataTracker.set(PHASE, MathHelper.clamp(nbt.getInt("Phase"), 1, 3));
		}
		if (hasCustomName()) {
			this.bossBar.setName(getDisplayName());
		}
	}

	/** A fight never survives its arena unloading: the Court resets instead of keeping a stale boss. */
	@Override
	public boolean shouldSave() {
		return getWorld().getRegistryKey() != EclipsedCourt.WORLD_KEY && super.shouldSave();
	}

	@Override
	public boolean cannotDespawn() {
		return true;
	}

	@Override
	public boolean isPushable() {
		return false;
	}

	@Override
	public boolean canUsePortals(boolean allowVehicles) {
		return false;
	}

	@Override
	protected SoundEvent getAmbientSound() {
		return SoundEvents.ENTITY_WARDEN_AMBIENT;
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return SoundEvents.ENTITY_IRON_GOLEM_HURT;
	}

	@Override
	protected SoundEvent getDeathSound() {
		return SoundEvents.ENTITY_WITHER_DEATH;
	}

	@Override
	protected float getSoundVolume() {
		return 2.0f;
	}

	private static final class Shockwave {
		private final Vec3d origin;
		private final Set<Integer> hit = new HashSet<>();
		private int age;

		private Shockwave(Vec3d origin, int age) {
			this.origin = origin;
			this.age = age;
		}
	}

	private static final class Strike {
		private final Vec3d pos;
		private int delay;

		private Strike(Vec3d pos, int delay) {
			this.pos = pos;
			this.delay = delay;
		}
	}
}
