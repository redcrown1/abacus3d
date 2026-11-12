package com.eclipsewarden;

import com.eclipsewarden.registry.ModBlocks;
import com.eclipsewarden.registry.ModCommands;
import com.eclipsewarden.registry.ModEntities;
import com.eclipsewarden.registry.ModItems;
import com.eclipsewarden.registry.ModParticles;
import com.eclipsewarden.ritual.RitualManager;
import com.eclipsewarden.world.EclipsedCourt;
import net.fabricmc.api.ModInitializer;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class EclipseWarden implements ModInitializer {
	public static final String MOD_ID = "eclipsewarden";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	public static Identifier id(String path) {
		return Identifier.of(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		ModParticles.init();
		ModBlocks.init();
		ModEntities.init();
		ModItems.init();
		EclipsedCourt.init();
		RitualManager.init();
		ModCommands.init();
	}
}
