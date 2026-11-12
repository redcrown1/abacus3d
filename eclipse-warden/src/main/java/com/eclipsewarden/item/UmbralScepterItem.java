package com.eclipsewarden.item;

import com.eclipsewarden.entity.UmbralBoltEntity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

public class UmbralScepterItem extends LoreItem {
	private static final int COOLDOWN = 14;
	private static final float DAMAGE = 7.0f;

	public UmbralScepterItem(Settings settings) {
		super(settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		ItemStack stack = user.getStackInHand(hand);
		if (!world.isClient) {
			Vec3d look = user.getRotationVec(1.0f);
			UmbralBoltEntity bolt = new UmbralBoltEntity(world, user, DAMAGE);
			bolt.setPosition(user.getEyePos().add(look.multiply(0.6)).subtract(0, 0.25, 0));
			bolt.setVelocity(look.multiply(1.5));
			world.spawnEntity(bolt);
			world.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.ENTITY_SHULKER_SHOOT,
					SoundCategory.PLAYERS, 0.8f, 1.5f);
			user.getItemCooldownManager().set(this, COOLDOWN);
			stack.damage(1, user, LivingEntity.getSlotForHand(hand));
		}
		user.swingHand(hand);
		return TypedActionResult.success(stack, world.isClient);
	}

	@Override
	public int getEnchantability() {
		return 15;
	}
}
