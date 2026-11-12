package com.eclipsewarden.item;

import com.eclipsewarden.entity.EclipseSlashEntity;
import com.eclipsewarden.registry.ModParticles;
import java.util.List;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.SwordItem;
import net.minecraft.item.ToolMaterial;
import net.minecraft.item.tooltip.TooltipType;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.world.World;

/** The Warden's own sword. Right-click throws a piercing crescent of light. */
public class EclipseBladeItem extends SwordItem {
	private static final int SLASH_COOLDOWN = 50;
	private static final float SLASH_DAMAGE = 9.0f;

	public EclipseBladeItem(ToolMaterial material, Settings settings) {
		super(material, settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		ItemStack stack = user.getStackInHand(hand);
		if (!world.isClient) {
			EclipseSlashEntity slash = new EclipseSlashEntity(world, user, SLASH_DAMAGE);
			slash.setVelocity(user.getRotationVec(1.0f).multiply(1.25));
			world.spawnEntity(slash);
			world.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.ENTITY_PLAYER_ATTACK_SWEEP,
					SoundCategory.PLAYERS, 1.0f, 0.6f);
			world.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.BLOCK_AMETHYST_BLOCK_RESONATE,
					SoundCategory.PLAYERS, 1.0f, 1.4f);
			user.getItemCooldownManager().set(this, SLASH_COOLDOWN);
			stack.damage(2, user, LivingEntity.getSlotForHand(hand));
		}
		user.swingHand(hand);
		return TypedActionResult.success(stack, world.isClient);
	}

	@Override
	public boolean postHit(ItemStack stack, LivingEntity target, LivingEntity attacker) {
		if (target.getWorld() instanceof ServerWorld world) {
			world.spawnParticles(ModParticles.ECLIPSE_SPARK, target.getX(), target.getBodyY(0.6), target.getZ(), 10, 0.3, 0.4, 0.3, 0.12);
			target.addStatusEffect(new StatusEffectInstance(StatusEffects.GLOWING, 80, 0, false, false));
		}
		return super.postHit(stack, target, attacker);
	}

	@Override
	public void appendTooltip(ItemStack stack, TooltipContext context, List<Text> tooltip, TooltipType type) {
		LoreItem.appendLore(stack, tooltip);
	}
}
