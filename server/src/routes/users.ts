import { Router } from "express";
import {
  parseUserRegistration,
  UserValidationError,
} from "../lib/user-registration.js";
import {
  getUserContextByWhatsapp,
  saveUserRegistration,
} from "../services/users.js";

export const usersRouter = Router();

usersRouter.post("/", async (req, res) => {
  try {
    const registration = parseUserRegistration(req.body);
    const result = await saveUserRegistration(registration);
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    if (error instanceof UserValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }

    console.error("Falha ao cadastrar usuario:", error);
    res.status(500).json({ error: "Nao foi possivel concluir o cadastro." });
  }
});

/** Retorna o perfil que o agente deve usar para personalizar a conversa. */
usersRouter.get("/context", async (req, res) => {
  const whatsapp = req.query.whatsapp;
  if (typeof whatsapp !== "string") {
    res.status(400).json({ error: "O parametro 'whatsapp' e obrigatorio." });
    return;
  }

  try {
    const user = await getUserContextByWhatsapp(whatsapp);
    if (!user) {
      res.status(404).json({ error: "Usuario nao encontrado." });
      return;
    }

    res.json({ user });
  } catch (error) {
    if (error instanceof UserValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }

    console.error("Falha ao buscar contexto do usuario:", error);
    res.status(500).json({ error: "Nao foi possivel carregar o contexto do usuario." });
  }
});
