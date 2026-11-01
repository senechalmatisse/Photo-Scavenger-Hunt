#!/bin/bash
#
# $Author$
#
# $RCSfile$
#
# $Date$
#
# $Revision$
#
# FONCTION : Lancement du backend Photo Scavenger Hunt
#            (application des migrations SQL puis demarrage de l'API)
#
# PARAMETRES : Ce programme prend en parametre
# (facultatif) 1..n: arguments transmis tels quels au processus Node
#

V_Vc_Driver_Persistance="${PERSISTENCE_DRIVER:-postgres}"
V_N_Code_Retour=0

echo "$(date +%Y-%m-%dT%H:%M:%S) Demarrage du backend (persistance : ${V_Vc_Driver_Persistance})"

# Migrations SQL versionnees : uniquement avec le pilote PostgreSQL
if [ "${V_Vc_Driver_Persistance}" = "postgres" ]
then
  node dist/shared/infrastructure/persistence/migrate.js
  V_N_Code_Retour=$?
  if [ "${V_N_Code_Retour}" -ne "0" ]
  then
    echo "$(date +%Y-%m-%dT%H:%M:%S) Echec des migrations (code retour ${V_N_Code_Retour})"
    exit "${V_N_Code_Retour}"
  fi
fi

# Le processus Node remplace le shell : il recoit directement les signaux d'arret de Docker
exec node dist/main.js "$@"
